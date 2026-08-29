-- Correct the economics of two postings. Both were balanced, and both
-- were wrong: debits equalling credits proves a posting is *arithmetically*
-- sound, never that it describes what actually happened.
--
-- 1. Withdrawal payout had its legs the wrong way round — it debited the
--    house bank and credited withdrawals clearing, so paying a client
--    *increased* the broker's cash. Fixed in src/domain/ledger/posting.ts
--    (buildWithdrawalPayoutPosting).
--
-- 2. Commissions, rebates and manual credits debited the house bank. A
--    commission credited to a partner's wallet moves no cash at all: it
--    increases what the broker owes. Booking the other leg against the
--    bank balanced perfectly while claiming the broker got richer every
--    time it paid a partner. That is what `broker_expense_usd` is for.

-- Withdrawals payable is a liability, not an asset in transit.
update public.ledger_accounts
set kind = 'liability',
    name = 'Withdrawals payable (USD)'
where key = 'clearing_withdrawals_usd';

insert into public.ledger_accounts (key, kind, currency, name) values
  ('broker_expense_usd', 'expense', 'USD',
   'Broker expense — partner commissions, rebates, goodwill (USD)')
on conflict (key) do nothing;

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
  -- Credit-normal: what the broker owes (client wallets, withdrawals
  -- payable) and what it has earned (fee income).
  -- Debit-normal: what the broker holds (house bank, deposits clearing)
  -- and what it has spent (broker expense).
  case
    when la.kind in ('client_wallet', 'fee_income', 'liability')
      then coalesce(sum(case when e.direction = 'credit' then e.amount else -e.amount end), 0)
    else coalesce(sum(case when e.direction = 'debit' then e.amount else -e.amount end), 0)
  end as balance,
  count(e.id) as entry_count
from public.ledger_accounts la
left join public.ledger_entries e on e.ledger_account_id = la.id
group by la.id, la.key, la.kind, la.owner_id, la.currency, la.name;

-- Keep the demo reset in step with the corrected chart of accounts.
-- Without this, `npm run db:reset-demo` would rebuild the *old* shape and
-- silently reintroduce both bugs.
create or replace function public.reset_demo_ledger(p_confirmation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_confirmation is distinct from 'ERASE-DEMO-LEDGER' then
    raise exception
      'reset_demo_ledger: refusing to run without the literal confirmation string.';
  end if;

  -- ledger_entries and audit_events are append-only; the reject_table_mutation
  -- triggers block DELETE, so the wipe has to be a TRUNCATE performed here
  -- rather than granted as a DELETE policy.
  truncate table
    public.ledger_entries,
    public.transactions,
    public.wallets,
    public.ledger_accounts,
    public.audit_events
  restart identity cascade;

  insert into public.ledger_accounts (key, kind, currency, name) values
    ('house_bank_usd',            'house',      'USD', 'House bank account (USD)'),
    ('clearing_deposits_usd',     'clearing',   'USD', 'Deposits clearing (USD)'),
    ('clearing_withdrawals_usd',  'liability',  'USD', 'Withdrawals payable (USD)'),
    ('fee_income_usd',            'fee_income', 'USD', 'Fee income (USD)'),
    ('broker_expense_usd',        'expense',    'USD',
     'Broker expense — partner commissions, rebates, goodwill (USD)')
  on conflict (key) do nothing;
end;
$$;

revoke execute on function public.reset_demo_ledger(text) from public, anon, authenticated;
grant execute on function public.reset_demo_ledger(text) to service_role;

comment on function public.reset_demo_ledger(text) is
  'Demo-only. Truncates the ledger, wallets and audit history, then re-creates the system chart of accounts. Requires the literal confirmation string and the service role; never called by application code.';
