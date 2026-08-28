-- Finance foundation: wallets, ledger, deposits, withdrawals, transfers.
-- Ownership boundary: owns wallets, ledger accounts, entries, transaction
-- references and reconciliation state (docs/product-plan.md section 5).
--
-- FOUNDATION ONLY in this pass: schema + RLS ship now so the ledger
-- boundary exists before any feature is built against it (ADR 0003).
-- No application code posts to these tables yet — that is Phase 3/4
-- (see docs/product-plan.md section 3). No row in ledger_entries or
-- transactions is ever granted UPDATE/DELETE by any RLS policy: this
-- schema does not have an "editable balance" escape hatch even by
-- omission.

create type public.ledger_account_kind as enum ('client_wallet', 'house', 'fee_income', 'clearing');
create type public.ledger_direction as enum ('debit', 'credit');
create type public.ledger_entry_state as enum ('pending', 'posted', 'reversed');
create type public.transaction_type as enum ('deposit', 'withdrawal', 'internal_transfer', 'fee', 'commission', 'rebate', 'adjustment');
create type public.transaction_status as enum ('pending', 'posted', 'failed', 'reversed');
create type public.money_movement_status as enum ('pending', 'confirmed', 'approved', 'rejected', 'paid', 'failed', 'reversed');

create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  kind public.ledger_account_kind not null,
  owner_id uuid references public.profiles (id), -- set for kind = 'client_wallet'
  currency text not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  currency text not null,
  ledger_account_id uuid not null unique references public.ledger_accounts (id),
  created_at timestamptz not null default now(),
  unique (client_id, currency)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  type public.transaction_type not null,
  status public.transaction_status not null default 'pending',
  external_ref text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

-- Immutable by design: insert-only. Corrections are new rows referencing
-- compensates_entry_id, never an UPDATE of the original (ADR 0003).
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id),
  ledger_account_id uuid not null references public.ledger_accounts (id),
  direction public.ledger_direction not null,
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null,
  entry_state public.ledger_entry_state not null default 'posted',
  compensates_entry_id uuid references public.ledger_entries (id),
  created_at timestamptz not null default now()
);

create index ledger_entries_account_idx on public.ledger_entries (ledger_account_id, created_at);
create index ledger_entries_transaction_idx on public.ledger_entries (transaction_id);

create table public.deposits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions (id),
  client_id uuid not null references public.profiles (id),
  wallet_id uuid not null references public.wallets (id),
  method text not null,
  provider_ref text,
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null,
  fee numeric(18, 2) not null default 0,
  status public.money_movement_status not null default 'pending',
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions (id),
  client_id uuid not null references public.profiles (id),
  wallet_id uuid not null references public.wallets (id),
  method text not null,
  provider_ref text,
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null,
  fee numeric(18, 2) not null default 0,
  status public.money_movement_status not null default 'pending',
  requires_dual_approval boolean not null default false,
  approved_by uuid references public.profiles (id),
  approval_notes text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table public.internal_transfers (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions (id),
  from_wallet_id uuid not null references public.wallets (id),
  to_wallet_id uuid not null references public.wallets (id),
  amount numeric(18, 2) not null check (amount > 0),
  currency text not null,
  created_at timestamptz not null default now()
);

create index deposits_client_idx on public.deposits (client_id, status);
create index withdrawals_client_idx on public.withdrawals (client_id, status);

-- ---------------------------------------------------------------------------
-- RLS — read access only in this pass; no INSERT/UPDATE policy is granted
-- to any role (including staff) because no application code writes these
-- tables yet. Writing to finance tables must arrive in a future migration
-- alongside the server actions that enforce balanced postings.
-- ---------------------------------------------------------------------------
alter table public.ledger_accounts enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;
alter table public.internal_transfers enable row level security;

create policy wallets_select_own on public.wallets for select using (client_id = auth.uid());
create policy wallets_select_staff on public.wallets for select using (public.has_permission('wallet.view'));

create policy ledger_accounts_select_staff on public.ledger_accounts for select using (public.has_permission('ledger.view'));

create policy transactions_select_staff on public.transactions for select using (public.has_permission('ledger.view'));

create policy ledger_entries_select_staff on public.ledger_entries for select using (public.has_permission('ledger.view'));

create policy deposits_select_own on public.deposits for select using (client_id = auth.uid());
create policy deposits_select_staff on public.deposits for select using (public.has_permission('deposit.view'));

create policy withdrawals_select_own on public.withdrawals for select using (client_id = auth.uid());
create policy withdrawals_select_staff on public.withdrawals for select using (public.has_permission('withdrawal.view'));

create policy internal_transfers_select_staff on public.internal_transfers for select using (public.has_permission('ledger.view'));
