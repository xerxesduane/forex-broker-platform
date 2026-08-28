-- Trading: account requests and MT5 identifiers/snapshots.
-- Ownership boundary: owns account requests and platform identifiers; it
-- does NOT own wallet balances. balance/equity/credit/margin fields below
-- are an explicit MT5 snapshot, not a ledger-derived wallet — see ADR 0003.
-- This platform is not the trading terminal: no orders/positions here,
-- only what MT5 reports about the account as a whole.

create type public.trading_account_type as enum ('demo', 'real');
create type public.trading_account_status as enum (
  'requested',
  'provisioning',
  'active',
  'rejected',
  'suspended',
  'closed'
);
create type public.spread_model as enum ('standard', 'raw_plus_commission');
create type public.commission_model as enum ('none', 'per_lot');

create table public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  account_type public.trading_account_type not null,
  status public.trading_account_status not null default 'requested',

  -- Platform identifiers (populated once provisioned by the MT5 adapter).
  platform text not null default 'MT5',
  mt5_login bigint,
  mt5_server text,
  mt5_group text,

  -- Trading conditions, fixed at request time for this demo.
  base_currency text not null default 'USD',
  leverage integer not null default 100,
  spread_model public.spread_model not null default 'standard',
  commission_model public.commission_model not null default 'none',
  swap_settings jsonb not null default '{"type": "standard"}'::jsonb,

  -- MT5 snapshot — refreshed by the MT5 adapter's sync, never edited
  -- directly, never a source of ledger truth.
  balance numeric(18, 2) not null default 0,
  equity numeric(18, 2) not null default 0,
  credit numeric(18, 2) not null default 0,
  used_margin numeric(18, 2) not null default 0,
  free_margin numeric(18, 2) not null default 0,
  margin_level numeric(9, 2),
  snapshot_synced_at timestamptz,

  requested_at timestamptz not null default now(),
  provisioned_at timestamptz,
  rejection_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.trading_accounts.balance is
  'MT5-reported snapshot, not a wallet. Never write this from a deposit/withdrawal flow directly — that money movement belongs in the ledger (see ADR 0003).';

create index trading_accounts_client_idx on public.trading_accounts (client_id, status);

create trigger trading_accounts_set_updated_at
  before update on public.trading_accounts
  for each row execute function public.set_updated_at();

alter table public.trading_accounts enable row level security;

create policy trading_accounts_select_own on public.trading_accounts
  for select using (client_id = auth.uid());

-- Clients may only ever insert a request for themselves, in the initial
-- 'requested' state — provisioning transitions happen server-side via the
-- service-role client after the MT5 adapter responds (see ADR 0005 and
-- src/server/trading-accounts.ts), intentionally outside RLS because it
-- is a trusted, server-validated system action rather than a user edit.
create policy trading_accounts_insert_own_requested on public.trading_accounts
  for insert with check (client_id = auth.uid() and status = 'requested');

create policy trading_accounts_select_staff on public.trading_accounts
  for select using (public.has_permission('trading_account.view'));
