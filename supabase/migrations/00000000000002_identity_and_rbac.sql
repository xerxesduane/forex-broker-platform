-- Identity: profiles (1:1 with auth.users) + staff RBAC catalogue.
-- Ownership boundary: this file owns who someone is and what they may do.
-- It does not own KYC decisions, trading accounts, or money (see later
-- migrations) — see docs/product-plan.md section 5.

create type public.account_kind as enum ('client', 'staff');

create type public.kyc_status as enum (
  'not_started',
  'submitted',
  'in_review',
  'needs_revision',
  'approved',
  'rejected'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  account_kind public.account_kind not null default 'client',
  first_name text,
  last_name text,
  date_of_birth date,
  phone_number text,
  country_of_residence text,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  profile_completed_at timestamptz,
  -- Trigger-maintained projection of the client's latest kyc_cases row.
  -- Single writer: sync_profile_kyc_status() in the KYC migration. Never
  -- written directly by application code — see ADR 0003's stance on
  -- denormalization (only ever DB-trigger-owned, never dual-written).
  kyc_status public.kyc_status not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.kyc_status is
  'Denormalized projection of the latest kyc_cases row for this client, maintained only by a DB trigger (see kyc_cases migration). Do not write from application code.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever Supabase Auth creates a user.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, account_kind)
  values (new.id, new.email, 'client');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Staff RBAC: atomic permissions, role bundles, staff role assignments.
-- Deny-by-default: a role with no role_permissions rows can do nothing.
-- Clients are never granted rows here — they are authorized by row
-- ownership only (see RLS policies in each domain migration). See ADR 0004.
-- ---------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.staff_role_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz not null default now(),
  unique (profile_id, role_id)
);

-- Helper used throughout RLS policies: does the current auth user hold
-- the given atomic permission via any assigned role?
create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_role_assignments sra
    join public.role_permissions rp on rp.role_id = sra.role_id
    join public.permissions p on p.id = rp.permission_id
    where sra.profile_id = auth.uid()
      and p.key = permission_key
  );
$$;

-- Helper: is the current auth user staff at all (any role assignment)?
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_role_assignments where profile_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_select_staff_with_client_view on public.profiles
  for select using (public.has_permission('client.view'));

-- Roles/permissions/assignments are reference and access-control data:
-- readable by staff with staff.manage (to administer), never client-writable.
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.staff_role_assignments enable row level security;

create policy roles_select_staff on public.roles
  for select using (public.is_staff());

create policy permissions_select_staff on public.permissions
  for select using (public.is_staff());

create policy role_permissions_select_staff on public.role_permissions
  for select using (public.is_staff());

create policy staff_role_assignments_select_self_or_manager on public.staff_role_assignments
  for select using (profile_id = auth.uid() or public.has_permission('staff.manage'));

-- ---------------------------------------------------------------------------
-- Seed: permission catalogue and role bundles.
-- This is reference data (the shape of the access-control system), not
-- demo/sample data, so it ships in a migration rather than the seed script.
-- ---------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('kyc.view', 'View KYC cases and documents'),
  ('kyc.review', 'Move a KYC case through review (request revision, etc.)'),
  ('kyc.decide', 'Approve or reject a KYC case'),
  ('client.view', 'View client profiles and account context'),
  ('client.manage', 'Edit client profile/account restrictions'),
  ('trading_account.view', 'View trading accounts and MT5 identifiers'),
  ('trading_account.provision', 'Provision or reject trading account requests'),
  ('trading_account.manage', 'Manage trading account status (suspend, close)'),
  ('wallet.view', 'View wallets and balances'),
  ('ledger.view', 'View ledger entries and transactions'),
  ('ledger.adjust', 'Post a manual compensating ledger entry'),
  ('deposit.view', 'View deposits'),
  ('deposit.approve', 'Approve or reject a deposit'),
  ('withdrawal.view', 'View withdrawals'),
  ('withdrawal.approve', 'Approve or reject a withdrawal'),
  ('referral.manage', 'Manage referral/IB structure'),
  ('commission.manage', 'Configure or approve commissions and rebates'),
  ('support.view', 'View support tickets'),
  ('support.manage', 'Respond to and resolve support tickets'),
  ('staff.manage', 'Manage staff accounts and role assignments'),
  ('role.manage', 'Manage role/permission catalogue'),
  ('audit.view', 'View audit events and integration events'),
  ('settings.manage', 'Manage site/email/integration settings'),
  ('integration.view', 'View integration/adapter status');

insert into public.roles (key, name, description) values
  ('super_admin', 'Super Administrator', 'Full platform access across all domains, including staff and role management.'),
  ('kyc_analyst', 'KYC Analyst', 'Reviews and decides KYC submissions.'),
  ('finance_operator', 'Finance Operator', 'Reviews deposits/withdrawals and prepares reconciliation and adjustments.'),
  ('finance_approver', 'Finance Approver', 'Approves high-risk or threshold-based money movement (maker-checker).'),
  ('support_agent', 'Support Agent', 'Resolves support tickets; no money-movement approval.'),
  ('trading_operations', 'Trading Operations', 'Reviews trading account eligibility and provisioning/sync health.'),
  ('marketing_growth', 'Marketing / Growth', 'Configures referrals, rankings and reward campaigns.'),
  ('administrator', 'Administrator', 'Manages staff, roles, settings and integrations; cannot bypass ledger controls.'),
  ('auditor', 'Auditor', 'Read-only access to cases, decisions, ledger evidence and audit trails.');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'kyc_analyst' and p.key in ('kyc.view', 'kyc.review', 'kyc.decide', 'client.view', 'audit.view');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'finance_operator' and p.key in ('deposit.view', 'withdrawal.view', 'wallet.view', 'ledger.view', 'client.view', 'audit.view');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'finance_approver' and p.key in ('deposit.view', 'deposit.approve', 'withdrawal.view', 'withdrawal.approve', 'wallet.view', 'ledger.view', 'ledger.adjust', 'client.view', 'audit.view');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'support_agent' and p.key in ('support.view', 'support.manage', 'client.view');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'trading_operations' and p.key in ('trading_account.view', 'trading_account.provision', 'trading_account.manage', 'client.view', 'audit.view');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'marketing_growth' and p.key in ('referral.manage', 'commission.manage', 'client.view');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'administrator' and p.key in ('staff.manage', 'role.manage', 'settings.manage', 'integration.view', 'audit.view', 'client.view');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p
where r.key = 'auditor' and p.key in ('audit.view', 'kyc.view', 'trading_account.view', 'wallet.view', 'ledger.view', 'deposit.view', 'withdrawal.view', 'client.view', 'support.view');
