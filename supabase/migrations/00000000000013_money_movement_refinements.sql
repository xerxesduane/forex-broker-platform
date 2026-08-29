-- Refinements found while wiring the money-movement workflows to the
-- finance schema.
--
-- deposits.transaction_id and withdrawals.transaction_id were created NOT
-- NULL, which assumed a request and its ledger posting are created
-- together. They are not, and deliberately so:
--
--   * A deposit exists as a *request* first and only becomes money when it
--     is credited (auto, or after a finance decision). Before that there is
--     no balanced posting to point at, and inventing a placeholder
--     transaction just to satisfy the column would put a meaningless row
--     in the ledger — the exact thing ADR 0003 exists to prevent.
--   * A rejected deposit never gets a transaction at all.
--
-- So the reference becomes nullable, and "has this been posted?" is read
-- from the column being non-null. The unique constraint still holds: two
-- deposits can never share one transaction (Postgres permits many NULLs in
-- a unique index).
alter table public.deposits alter column transaction_id drop not null;
alter table public.withdrawals alter column transaction_id drop not null;

comment on column public.deposits.transaction_id is
  'The balanced ledger transaction that credited this deposit; null until it is credited. Never a placeholder — a deposit with no posting has genuinely not moved any money.';

comment on column public.withdrawals.transaction_id is
  'The reservation posting that debited the client wallet when this withdrawal was requested. Null only in the brief window before the reservation posts; a rejection reverses it rather than clearing it.';

-- The admin queues sort and filter on these constantly.
create index if not exists deposits_status_created_idx on public.deposits (status, created_at desc);
create index if not exists withdrawals_status_created_idx on public.withdrawals (status, created_at desc);
create index if not exists transactions_type_created_idx on public.transactions (type, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, updated_at desc);
create index if not exists profiles_account_kind_idx on public.profiles (account_kind, created_at desc);

-- The portal addresses transfer recipients by their public client
-- reference. That lookup has to work for a client who, by design, cannot
-- read another client's profile row — so it goes through a narrow
-- security-definer function that returns only what a sender needs to
-- confirm they have the right person, and nothing else.
create or replace function public.lookup_transfer_recipient(p_referral_code text)
returns table (referral_code text, display_name text, can_receive boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.referral_code,
    coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(left(p.last_name, 1), '')), ''), 'Aurion client'),
    p.account_status = 'active' and p.account_kind = 'client'
  from public.profiles p
  where p.referral_code = upper(trim(p_referral_code))
    and p.account_kind = 'client'
    and p.id <> auth.uid()
  limit 1;
$$;

revoke execute on function public.lookup_transfer_recipient(text) from public, anon;
grant execute on function public.lookup_transfer_recipient(text) to authenticated, service_role;

comment on function public.lookup_transfer_recipient(text) is
  'Confirms a transfer recipient exists without exposing their profile. Returns a first name plus last initial only, never an email, id or address, and never the caller themselves.';
