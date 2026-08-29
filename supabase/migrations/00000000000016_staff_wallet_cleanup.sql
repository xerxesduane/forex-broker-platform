-- A profile is created as a client and only becomes staff afterwards.
--
-- public.handle_new_auth_user() inserts every new profile with
-- account_kind = 'client' (Supabase Auth has no idea who is staff), and
-- ensure_client_wallet() then dutifully gives it a USD wallet. When an
-- administrator promotes that profile to staff, the wallet is left behind:
-- harmless, but wrong — a member of staff is not a client and must not
-- appear in client-wallet listings or the money-owed-to-clients total.
--
-- Rather than weaken the "every client has a wallet" guarantee, the
-- promotion cleans up after itself. Only an untouched wallet is removed:
-- if it has any ledger history at all, the wallet stays and the promotion
-- is refused, because deleting a wallet with entries would orphan real
-- postings, and the ledger does not permit that.
create or replace function public.drop_unused_wallet_on_staff_promotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_count integer;
begin
  if new.account_kind <> 'staff' or old.account_kind = 'staff' then
    return new;
  end if;

  select count(*) into v_entry_count
  from public.ledger_entries e
  join public.wallets w on w.ledger_account_id = e.ledger_account_id
  where w.client_id = new.id;

  if v_entry_count > 0 then
    raise exception
      'Cannot promote % to staff: their wallet holds % ledger entries. Money movement cannot be orphaned (ADR 0003).',
      new.email, v_entry_count;
  end if;

  -- wallets.ledger_account_id references ledger_accounts, so the wallet
  -- row goes first or the foreign key blocks the delete. A data-modifying
  -- CTE keeps both deletes in one statement.
  with removed as (
    delete from public.wallets where client_id = new.id returning ledger_account_id
  )
  delete from public.ledger_accounts where id in (select ledger_account_id from removed);

  return new;
end;
$$;

revoke execute on function public.drop_unused_wallet_on_staff_promotion() from public, anon, authenticated;

create trigger profiles_drop_wallet_on_staff_promotion
  after update of account_kind on public.profiles
  for each row execute function public.drop_unused_wallet_on_staff_promotion();

-- Backfill: clear the wallets already left on staff profiles. The join to
-- ledger_entries makes this a no-op for any wallet that has been used.
with removed_wallets as (
  delete from public.wallets w
  where w.client_id in (select id from public.profiles where account_kind = 'staff')
    and not exists (
      select 1 from public.ledger_entries e where e.ledger_account_id = w.ledger_account_id
    )
  returning w.ledger_account_id
)
delete from public.ledger_accounts la
where la.id in (select ledger_account_id from removed_wallets);
