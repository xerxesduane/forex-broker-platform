-- Aurion Markets — foundational extensions.
-- pgcrypto gives us gen_random_uuid(); Supabase projects usually have this
-- enabled already, but the migration is explicit so a fresh Postgres also works.
create extension if not exists "pgcrypto";

-- Generic "touch updated_at" trigger function, reused by every table below
-- that carries an updated_at column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
