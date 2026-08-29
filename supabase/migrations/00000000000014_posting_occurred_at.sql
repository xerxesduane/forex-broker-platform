-- Let a posting record when it actually happened.
--
-- post_transaction() stamped every row with now(), which is right for a
-- live call and wrong for two real cases: seeding a demonstration history,
-- and importing a batch of settled activity from a provider. Both need the
-- ledger to say when the money moved, not when the row was written.
--
-- p_occurred_at is optional and defaults to now(), so every existing call
-- site keeps its current behaviour. The invariant is untouched: the
-- balance check, the two-leg minimum, the currency check and the
-- posting-path trigger all still apply — a backdated posting must balance
-- exactly like a live one.
--
-- The function is dropped and recreated rather than replaced: adding a
-- parameter creates a second overload, and an ambiguous post_transaction
-- is precisely the kind of thing that should not exist on this path.
drop function if exists public.post_transaction(public.transaction_type, text, text, jsonb, text);

create function public.post_transaction(
  p_type public.transaction_type,
  p_currency text,
  p_idempotency_key text,
  p_legs jsonb,
  p_external_ref text default null,
  p_occurred_at timestamptz default null
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
  v_at timestamptz := coalesce(p_occurred_at, now());
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

  insert into public.transactions (type, status, external_ref, idempotency_key, created_at, posted_at)
  values (p_type, 'posted', p_external_ref, p_idempotency_key, v_at, v_at)
  returning id into v_transaction_id;

  perform set_config('aurion.ledger_posting', 'on', true);

  insert into public.ledger_entries
    (transaction_id, ledger_account_id, direction, amount, currency, entry_state, created_at)
  select
    v_transaction_id,
    (t.leg->>'ledger_account_id')::uuid,
    (t.leg->>'direction')::public.ledger_direction,
    (t.leg->>'amount')::numeric,
    p_currency,
    'posted',
    v_at
  from jsonb_array_elements(p_legs) as t(leg);

  perform set_config('aurion.ledger_posting', 'off', true);

  return v_transaction_id;
end;
$$;

revoke execute on function public.post_transaction(public.transaction_type, text, text, jsonb, text, timestamptz) from public, anon, authenticated;
grant execute on function public.post_transaction(public.transaction_type, text, text, jsonb, text, timestamptz) to service_role;

comment on function public.post_transaction(public.transaction_type, text, text, jsonb, text, timestamptz) is
  'The only path into ledger_entries. Rejects unbalanced, single-leg, mixed-currency and non-positive postings; idempotent on idempotency_key; p_occurred_at backdates a posting without weakening any check. Callable only by the service role (server actions), never from a browser session.';
