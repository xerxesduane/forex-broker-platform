-- Finance activation: turn the Phase-3/4 foundation into a working
-- money-movement system — wallets per client, a balanced-posting gateway,
-- derived balance views, and the RLS writes the workflows need.
--
-- The ledger boundary from ADR 0003 is *strengthened* here, not relaxed:
--
--   * No role gets an INSERT policy on ledger_entries. The only way a row
--     reaches that table is public.post_transaction(), which refuses an
--     unbalanced or mixed-currency posting.
--   * A BEFORE INSERT trigger enforces that path even for the service
--     role (which bypasses RLS entirely), by requiring a transaction-local
--     flag that only post_transaction() sets. "Admin compromised" is not
--     a route to an unbalanced ledger.
--   * UPDATE and DELETE on ledger_entries raise unconditionally. A
--     correction is a new compensating row (compensates_entry_id), which
--     is what public.reverse_transaction() creates.
--   * Balances are never stored. wallet_balances/ledger_account_balances
--     are views that fold the entries every time they are read.

-- ---------------------------------------------------------------------------
-- System (house) ledger accounts need stable identifiers so application
-- code can find them without hardcoding a generated uuid.
-- ---------------------------------------------------------------------------
alter table public.ledger_accounts add column if not exists key text unique;

comment on column public.ledger_accounts.key is
  'Stable identifier for system accounts (house bank, clearing, fee income). Null for per-client wallet accounts, which are addressed via wallets.ledger_account_id.';

insert into public.ledger_accounts (key, kind, currency, name) values
  ('house_bank_usd',            'house',      'USD', 'House bank account (USD)'),
  ('clearing_deposits_usd',     'clearing',   'USD', 'Deposits clearing (USD)'),
  ('clearing_withdrawals_usd',  'clearing',   'USD', 'Withdrawals clearing (USD)'),
  ('fee_income_usd',            'fee_income', 'USD', 'Fee income (USD)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Every client gets a USD wallet (and its backing ledger account) on
-- profile creation. Doing this in the database means no application path
-- can produce a client without somewhere for money to land.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_client_wallet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_ledger_account_id uuid;
begin
  if new.account_kind <> 'client' then
    return new;
  end if;

  if exists (select 1 from public.wallets where client_id = new.id and currency = 'USD') then
    return new;
  end if;

  insert into public.ledger_accounts (kind, owner_id, currency, name)
  values ('client_wallet', new.id, 'USD', 'Client wallet (USD) — ' || new.email)
  returning id into new_ledger_account_id;

  insert into public.wallets (client_id, currency, ledger_account_id)
  values (new.id, 'USD', new_ledger_account_id);

  return new;
end;
$$;

revoke execute on function public.ensure_client_wallet() from public, anon, authenticated;

create trigger profiles_ensure_client_wallet
  after insert on public.profiles
  for each row execute function public.ensure_client_wallet();

-- Backfill wallets for profiles that already exist.
do $$
declare
  profile_row record;
  new_ledger_account_id uuid;
begin
  for profile_row in
    select p.id, p.email from public.profiles p
    where p.account_kind = 'client'
      and not exists (select 1 from public.wallets w where w.client_id = p.id and w.currency = 'USD')
  loop
    insert into public.ledger_accounts (kind, owner_id, currency, name)
    values ('client_wallet', profile_row.id, 'USD', 'Client wallet (USD) — ' || profile_row.email)
    returning id into new_ledger_account_id;

    insert into public.wallets (client_id, currency, ledger_account_id)
    values (profile_row.id, 'USD', new_ledger_account_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Append-only enforcement, above the RLS layer so it also binds the
-- service role.
-- ---------------------------------------------------------------------------
create or replace function public.reject_table_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '%.% is append-only by design: % is never permitted (ADR 0003)',
    tg_table_schema, tg_table_name, tg_op;
end;
$$;

create trigger ledger_entries_reject_update
  before update on public.ledger_entries
  for each statement execute function public.reject_table_mutation();

create trigger ledger_entries_reject_delete
  before delete on public.ledger_entries
  for each statement execute function public.reject_table_mutation();

create trigger audit_events_reject_update
  before update on public.audit_events
  for each statement execute function public.reject_table_mutation();

create trigger audit_events_reject_delete
  before delete on public.audit_events
  for each statement execute function public.reject_table_mutation();

-- Only post_transaction() sets aurion.ledger_posting, and it sets it
-- transaction-locally, so the window closes at commit.
create or replace function public.enforce_ledger_posting_path()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('aurion.ledger_posting', true), 'off') <> 'on' then
    raise exception
      'ledger_entries is written only by public.post_transaction(), which validates that debits equal credits. Direct inserts are rejected (ADR 0003).';
  end if;
  return new;
end;
$$;

create trigger ledger_entries_posting_path_only
  before insert on public.ledger_entries
  for each row execute function public.enforce_ledger_posting_path();

-- ---------------------------------------------------------------------------
-- The posting gateway.
--
-- legs is a json array of { ledger_account_id, direction, amount }.
-- Rejected unless: at least two legs, every amount > 0, one currency, and
-- total debits = total credits to the cent. Idempotent on
-- idempotency_key — a retried call returns the original transaction id
-- instead of double-posting.
-- ---------------------------------------------------------------------------
create or replace function public.post_transaction(
  p_type public.transaction_type,
  p_currency text,
  p_idempotency_key text,
  p_legs jsonb,
  p_external_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_transaction_id uuid;
  v_total_debits numeric(18, 2) := 0;
  v_total_credits numeric(18, 2) := 0;
  v_leg jsonb;
  v_leg_count integer := 0;
begin
  select id into v_existing_id from public.transactions where idempotency_key = p_idempotency_key;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if jsonb_typeof(p_legs) <> 'array' then
    raise exception 'post_transaction: legs must be a json array';
  end if;

  for v_leg in select t.leg from jsonb_array_elements(p_legs) as t(leg) loop
    v_leg_count := v_leg_count + 1;

    if (v_leg->>'amount')::numeric <= 0 then
      raise exception 'post_transaction: every leg amount must be greater than zero (got %)', v_leg->>'amount';
    end if;

    if (v_leg->>'direction') not in ('debit', 'credit') then
      raise exception 'post_transaction: direction must be debit or credit (got %)', v_leg->>'direction';
    end if;

    if not exists (
      select 1 from public.ledger_accounts
      where id = (v_leg->>'ledger_account_id')::uuid and currency = p_currency
    ) then
      raise exception 'post_transaction: ledger account % does not exist in currency %',
        v_leg->>'ledger_account_id', p_currency;
    end if;

    if (v_leg->>'direction') = 'debit' then
      v_total_debits := v_total_debits + (v_leg->>'amount')::numeric;
    else
      v_total_credits := v_total_credits + (v_leg->>'amount')::numeric;
    end if;
  end loop;

  if v_leg_count < 2 then
    raise exception 'post_transaction: a double-entry transaction needs at least two legs (got %)', v_leg_count;
  end if;

  if v_total_debits <> v_total_credits then
    raise exception
      'post_transaction: unbalanced posting rejected — debits % <> credits % (ADR 0003)',
      v_total_debits, v_total_credits;
  end if;

  insert into public.transactions (type, status, external_ref, idempotency_key, posted_at)
  values (p_type, 'posted', p_external_ref, p_idempotency_key, now())
  returning id into v_transaction_id;

  perform set_config('aurion.ledger_posting', 'on', true);

  insert into public.ledger_entries (transaction_id, ledger_account_id, direction, amount, currency, entry_state)
  select
    v_transaction_id,
    (t.leg->>'ledger_account_id')::uuid,
    (t.leg->>'direction')::public.ledger_direction,
    (t.leg->>'amount')::numeric,
    p_currency,
    'posted'
  from jsonb_array_elements(p_legs) as t(leg);

  perform set_config('aurion.ledger_posting', 'off', true);

  return v_transaction_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reversal: never an UPDATE of history. Mirrors every leg of the original
-- transaction in the opposite direction, each new row pointing at the
-- entry it compensates.
-- ---------------------------------------------------------------------------
create or replace function public.reverse_transaction(
  p_transaction_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_reversal_id uuid;
  v_original public.transactions;
begin
  select id into v_existing_id from public.transactions where idempotency_key = p_idempotency_key;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select * into v_original from public.transactions where id = p_transaction_id;
  if v_original.id is null then
    raise exception 'reverse_transaction: transaction % not found', p_transaction_id;
  end if;
  if v_original.status = 'reversed' then
    raise exception 'reverse_transaction: transaction % is already reversed', p_transaction_id;
  end if;

  insert into public.transactions (type, status, external_ref, idempotency_key, posted_at)
  values (v_original.type, 'posted', 'reversal-of:' || v_original.id::text, p_idempotency_key, now())
  returning id into v_reversal_id;

  perform set_config('aurion.ledger_posting', 'on', true);

  insert into public.ledger_entries
    (transaction_id, ledger_account_id, direction, amount, currency, entry_state, compensates_entry_id)
  select
    v_reversal_id,
    e.ledger_account_id,
    case when e.direction = 'debit' then 'credit'::public.ledger_direction
         else 'debit'::public.ledger_direction end,
    e.amount,
    e.currency,
    'posted',
    e.id
  from public.ledger_entries e
  where e.transaction_id = p_transaction_id;

  perform set_config('aurion.ledger_posting', 'off', true);

  update public.transactions set status = 'reversed' where id = p_transaction_id;

  return v_reversal_id;
end;
$$;

-- Reachable only from trusted server code holding the service role key —
-- never from a browser session, however authenticated.
revoke execute on function public.post_transaction(public.transaction_type, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.reverse_transaction(uuid, text) from public, anon, authenticated;

grant execute on function public.post_transaction(public.transaction_type, text, text, jsonb, text) to service_role;
grant execute on function public.reverse_transaction(uuid, text) to service_role;

comment on function public.post_transaction(public.transaction_type, text, text, jsonb, text) is
  'The only path into ledger_entries. Rejects unbalanced, single-leg, mixed-currency and non-positive postings; idempotent on idempotency_key. Callable only by the service role (server actions), never from a browser session.';

-- ---------------------------------------------------------------------------
-- Derived balances. Nothing here is stored; every read folds the entries.
-- security_invoker keeps each caller's RLS in force through the view.
-- ---------------------------------------------------------------------------
create or replace view public.ledger_account_balances
with (security_invoker = on) as
select
  la.id as ledger_account_id,
  la.key,
  la.kind,
  la.owner_id,
  la.currency,
  la.name,
  coalesce(sum(case when e.direction = 'debit'  then e.amount else 0 end), 0) as total_debits,
  coalesce(sum(case when e.direction = 'credit' then e.amount else 0 end), 0) as total_credits,
  -- Asset/expense accounts (house, clearing) are debit-normal; liability
  -- and income accounts (client wallets, fee income) are credit-normal.
  case
    when la.kind in ('client_wallet', 'fee_income')
      then coalesce(sum(case when e.direction = 'credit' then e.amount else -e.amount end), 0)
    else coalesce(sum(case when e.direction = 'debit' then e.amount else -e.amount end), 0)
  end as balance,
  count(e.id) as entry_count
from public.ledger_accounts la
left join public.ledger_entries e on e.ledger_account_id = la.id
group by la.id, la.key, la.kind, la.owner_id, la.currency, la.name;

create or replace view public.wallet_balances
with (security_invoker = on) as
select
  w.id as wallet_id,
  w.client_id,
  w.currency,
  w.ledger_account_id,
  b.balance as available_balance,
  coalesce((
    select sum(d.amount) from public.deposits d
    where d.wallet_id = w.id and d.status in ('pending', 'confirmed')
  ), 0) as pending_deposits,
  coalesce((
    select sum(wd.amount) from public.withdrawals wd
    where wd.wallet_id = w.id and wd.status in ('pending', 'approved')
  ), 0) as pending_withdrawals
from public.wallets w
join public.ledger_account_balances b on b.ledger_account_id = w.ledger_account_id;

-- The proof screen: across the whole ledger, debits must equal credits.
create or replace view public.trial_balance
with (security_invoker = on) as
select
  e.currency,
  sum(case when e.direction = 'debit'  then e.amount else 0 end) as total_debits,
  sum(case when e.direction = 'credit' then e.amount else 0 end) as total_credits,
  sum(case when e.direction = 'debit'  then e.amount else -e.amount end) as difference,
  count(*) as entry_count
from public.ledger_entries e
group by e.currency;

-- ---------------------------------------------------------------------------
-- Maker-checker: withdrawals above a threshold need two distinct
-- approvers. Recorded as rows, so "who signed off" is evidence rather
-- than a boolean.
-- ---------------------------------------------------------------------------
create table public.withdrawal_approvals (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references public.withdrawals (id) on delete cascade,
  approver_id uuid not null references public.profiles (id),
  decision text not null check (decision in ('approve', 'reject')),
  notes text,
  created_at timestamptz not null default now(),
  -- One approver, one signature: the second approval must come from a
  -- different member of staff (enforced here and in the server action).
  unique (withdrawal_id, approver_id)
);

create index withdrawal_approvals_withdrawal_idx on public.withdrawal_approvals (withdrawal_id);

alter table public.withdrawal_approvals enable row level security;

create policy withdrawal_approvals_select_staff on public.withdrawal_approvals
  for select using (public.has_permission('withdrawal.view'));

create policy withdrawal_approvals_insert_approver on public.withdrawal_approvals
  for insert with check (approver_id = auth.uid() and public.has_permission('withdrawal.approve'));

-- Extra columns the money-movement workflows need.
alter table public.deposits
  add column if not exists reviewed_by uuid references public.profiles (id),
  add column if not exists review_notes text,
  add column if not exists reference_code text;

alter table public.withdrawals
  add column if not exists payout_detail text,
  add column if not exists reference_code text,
  add column if not exists reversal_transaction_id uuid references public.transactions (id),
  add column if not exists paid_at timestamptz;

alter table public.internal_transfers
  add column if not exists initiated_by uuid references public.profiles (id),
  add column if not exists note text;

-- ---------------------------------------------------------------------------
-- Finance RLS writes.
--
-- Clients may only ever *request* — insert a pending deposit/withdrawal
-- for a wallet they own. Every status change after that is a staff
-- decision, gated on the matching atomic permission. transactions and
-- ledger_entries stay insert-policy-free (see post_transaction above).
-- ---------------------------------------------------------------------------
create policy deposits_insert_own_pending on public.deposits
  for insert with check (
    client_id = auth.uid()
    and status = 'pending'
    and exists (select 1 from public.wallets w where w.id = wallet_id and w.client_id = auth.uid())
  );

create policy deposits_update_staff on public.deposits
  for update using (public.has_permission('deposit.approve'))
  with check (public.has_permission('deposit.approve'));

create policy withdrawals_insert_own_pending on public.withdrawals
  for insert with check (
    client_id = auth.uid()
    and status = 'pending'
    and exists (select 1 from public.wallets w where w.id = wallet_id and w.client_id = auth.uid())
  );

create policy withdrawals_update_staff on public.withdrawals
  for update using (public.has_permission('withdrawal.approve'))
  with check (public.has_permission('withdrawal.approve'));

-- Clients can read their own money trail: their wallet's ledger account,
-- its entries, and the transactions those entries belong to.
create policy ledger_accounts_select_own on public.ledger_accounts
  for select using (owner_id = auth.uid());

create policy ledger_entries_select_own on public.ledger_entries
  for select using (
    exists (
      select 1 from public.wallets w
      where w.ledger_account_id = ledger_entries.ledger_account_id and w.client_id = auth.uid()
    )
  );

create policy transactions_select_own on public.transactions
  for select using (
    exists (
      select 1
      from public.ledger_entries e
      join public.wallets w on w.ledger_account_id = e.ledger_account_id
      where e.transaction_id = transactions.id and w.client_id = auth.uid()
    )
  );

create policy internal_transfers_select_own on public.internal_transfers
  for select using (
    exists (
      select 1 from public.wallets w
      where (w.id = from_wallet_id or w.id = to_wallet_id) and w.client_id = auth.uid()
    )
  );
