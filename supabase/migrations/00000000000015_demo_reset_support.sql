-- Support for `npm run db:reset-demo` on a demonstration database.
--
-- ledger_entries and audit_events are append-only: triggers raise on any
-- UPDATE or DELETE, for every role including the service role. That is a
-- guarantee worth keeping, so the reset script does not get a DELETE grant
-- that would quietly weaken it. Instead it calls this one function, which
-- TRUNCATEs the demo tables and re-creates the system chart of accounts.
--
-- Guarded two ways, because a function that erases a ledger has to be hard
-- to invoke by accident:
--
--   1. It requires an explicit confirmation string. A confirmation
--      argument rather than a session setting is deliberate: PostgREST
--      pools connections, so a "set a flag, then call" pattern can land
--      the two halves on different sessions and silently lose the guard.
--   2. EXECUTE is granted only to service_role — anon and authenticated
--      are revoked, so it is unreachable from any browser session.
--
-- The application never calls this. Only supabase/seed/reset.ts does, and
-- that script additionally refuses to run without ALLOW_DEMO_DATA_RESET.
create or replace function public.reset_demo_ledger(p_confirmation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_confirmation is distinct from 'ERASE-DEMO-LEDGER' then
    raise exception
      'reset_demo_ledger() refuses to run without the exact confirmation string. This function erases the entire ledger and audit history.';
  end if;

  -- TRUNCATE does not fire the row-level append-only triggers, which is
  -- precisely why this capability is confined to one guarded function
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
    ('clearing_withdrawals_usd',  'clearing',   'USD', 'Withdrawals clearing (USD)'),
    ('fee_income_usd',            'fee_income', 'USD', 'Fee income (USD)')
  on conflict (key) do nothing;
end;
$$;

revoke execute on function public.reset_demo_ledger(text) from public, anon, authenticated;
grant execute on function public.reset_demo_ledger(text) to service_role;

comment on function public.reset_demo_ledger(text) is
  'Demo-only. Truncates the ledger, wallets and audit history, then re-creates the system chart of accounts. Requires the literal confirmation string and the service role; never called by application code.';
