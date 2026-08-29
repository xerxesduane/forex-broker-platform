-- Follow-up on the database linter after the activation migrations.
--
-- Two trigger functions were created without a pinned search_path. Neither
-- resolves an unqualified object today, so neither is exploitable as
-- written — but a search_path-mutable SECURITY-adjacent function is the
-- kind of thing that becomes a problem the moment someone adds a table
-- reference to it, and every other function in this schema pins it.
create or replace function public.enforce_ledger_posting_path()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('aurion.ledger_posting', true), 'off') <> 'on' then
    raise exception
      'ledger_entries is written only by public.post_transaction(), which validates that debits equal credits. Direct inserts are rejected (ADR 0003).';
  end if;
  return new;
end;
$$;

create or replace function public.reject_table_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '%.% is append-only by design: % is never permitted (ADR 0003)',
    tg_table_schema, tg_table_name, tg_op;
end;
$$;

-- ---------------------------------------------------------------------------
-- The linter also reports three findings that are deliberate. Recorded here
-- so a reviewer can see they were considered rather than missed.
--
-- 1. public.user_mfa has RLS enabled with no policies ("RLS Enabled No
--    Policy", INFO). That is the design: a TOTP secret must be unreadable
--    by every browser session, including its owner's. Deny-by-default with
--    zero policies is the strongest form of that, and the service role
--    reaches it only from server actions.
--
-- 2. has_permission() and is_staff() are SECURITY DEFINER and callable by
--    `authenticated`. Both are required to be: every RLS policy in this
--    schema calls has_permission(), and requirePermission() in the
--    application calls it as the signed-in user. They read only the
--    caller's own auth.uid() role assignments and return a boolean, so a
--    caller learns nothing they could not infer from their own access.
--    Already revoked from `anon` in the security-hardening migration.
--
-- 3. lookup_transfer_recipient() is SECURITY DEFINER and callable by
--    `authenticated` on purpose — it is how a client confirms a transfer
--    recipient exists without being able to read another client's profile.
--    It returns a first name plus last initial and nothing else, and
--    excludes the caller.
comment on table public.user_mfa is
  'TOTP secrets. RLS is enabled with NO policies at all, deliberately: unreadable by any browser session including the owner''s. Only the service role (server actions) touches it. The database linter reports this as "RLS Enabled No Policy" — that finding is the intended design, not an oversight.';
