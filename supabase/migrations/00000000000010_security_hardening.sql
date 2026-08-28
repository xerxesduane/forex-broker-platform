-- Hardening pass, addressing Supabase's security advisor findings after
-- the initial schema landed:
--
-- 1. set_updated_at() had a mutable search_path — pin it, matching every
--    other function in this schema.
-- 2. handle_new_auth_user() and sync_profile_kyc_status() are trigger-only
--    functions (they read `new`/`old`, which only exist inside a trigger)
--    but were still exposed as callable RPC endpoints to anon/authenticated
--    by default. Calling them directly would error, not misbehave, but
--    there is no reason to leave that surface reachable — revoke it.
-- 3. has_permission()/is_staff() are meant to be called by authenticated
--    server code (see src/lib/rbac/require-permission.ts) — keep that
--    working, but revoke from the unauthenticated `anon` role, which has
--    no legitimate reason to call them (auth.uid() is null for anon, so
--    they were already safe, just needlessly reachable).

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.sync_profile_kyc_status() from public, anon, authenticated;

-- Postgres grants EXECUTE to the PUBLIC pseudo-role by default at function
-- creation time; every role (including anon) inherits through that unless
-- revoked from PUBLIC directly — a role-specific revoke alone is not
-- enough. Revoke from PUBLIC, then re-grant only to the role that
-- legitimately calls these (server code, always as an authenticated user
-- — see src/lib/rbac/require-permission.ts). `authenticated` retaining
-- EXECUTE is intentional, not a residual gap.
revoke execute on function public.has_permission(text) from public;
revoke execute on function public.is_staff() from public;

grant execute on function public.has_permission(text) to authenticated;
grant execute on function public.is_staff() to authenticated;
