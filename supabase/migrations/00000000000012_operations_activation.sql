-- Operations activation: the tables the remaining back-office workflows
-- need — configurable platform settings, email templates, staff notes and
-- client risk state, sign-in evidence, second-factor enrolment, the IB
-- commission rule set, and support-ticket routing.
--
-- Same house rules as everywhere else: RLS on, default deny, one explicit
-- policy per legitimate caller, and a permission key behind every staff
-- write (ADR 0004).

-- ---------------------------------------------------------------------------
-- Platform settings. Typed at the application boundary with Zod; stored as
-- one row per key so a new setting is an insert, not a migration.
-- Behaviour actually reads these: the deposit auto-credit limit and the
-- withdrawal dual-approval threshold below drive src/domain/finance.
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  label text not null,
  description text not null,
  "group" text not null default 'general',
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

insert into public.platform_settings (key, value, label, description, "group") values
  ('brand.name', '"Aurion Markets"'::jsonb, 'Brand name', 'Shown across the public site, portal and outbound email.', 'general'),
  ('brand.support_email', '"support@aurion-markets.example"'::jsonb, 'Support email', 'Reply-to address on client notifications.', 'general'),
  ('brand.support_hours', '"24/5, Monday 00:00 – Friday 22:00 UTC"'::jsonb, 'Support hours', 'Published on the contact page and in the portal.', 'general'),
  ('finance.deposit_min', '50'::jsonb, 'Minimum deposit', 'Smallest deposit a client may request, in account currency.', 'finance'),
  ('finance.deposit_auto_credit_limit', '2500'::jsonb, 'Deposit auto-credit limit', 'Provider-confirmed deposits at or below this amount post to the ledger automatically. Above it, a finance operator must approve.', 'finance'),
  ('finance.withdrawal_min', '50'::jsonb, 'Minimum withdrawal', 'Smallest withdrawal a client may request.', 'finance'),
  ('finance.withdrawal_fee', '5'::jsonb, 'Withdrawal fee', 'Flat fee deducted from each withdrawal and credited to fee income.', 'finance'),
  ('finance.withdrawal_dual_approval_threshold', '5000'::jsonb, 'Dual-approval threshold', 'Withdrawals at or above this amount require two distinct approvers (maker-checker).', 'finance'),
  ('trading.leverage_options', '[50, 100, 200, 500]'::jsonb, 'Leverage options', 'Selectable leverage ratios on an account request.', 'trading'),
  ('trading.demo_starting_balance', '10000'::jsonb, 'Demo starting balance', 'Simulated opening balance on a new demo MT5 account.', 'trading'),
  ('trading.real_accounts_require_approval', 'true'::jsonb, 'Real accounts need approval', 'When on, a real-account request queues for trading operations instead of provisioning immediately.', 'trading'),
  ('growth.referral_commission_bps', '150'::jsonb, 'Referral commission (bps)', 'Basis points of a referred client''s net deposit credited to their introducing broker.', 'growth'),
  ('growth.rebate_bps', '25'::jsonb, 'Client rebate (bps)', 'Basis points of a deposit credited back to the depositing client.', 'growth'),
  ('compliance.kyc_document_types', '["identity_document", "proof_of_address"]'::jsonb, 'Required KYC documents', 'Document set a client must supply for verification.', 'compliance');

alter table public.platform_settings enable row level security;

create policy platform_settings_select_authenticated on public.platform_settings
  for select using (auth.uid() is not null);

create policy platform_settings_update_manager on public.platform_settings
  for update using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));

-- ---------------------------------------------------------------------------
-- Email templates. The simulated email adapter renders these instead of
-- sending; the admin console edits them.
-- ---------------------------------------------------------------------------
create table public.email_templates (
  key text primary key,
  name text not null,
  subject text not null,
  body text not null,
  available_variables text[] not null default '{}',
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create trigger email_templates_set_updated_at
  before update on public.email_templates
  for each row execute function public.set_updated_at();

insert into public.email_templates (key, name, subject, body, available_variables) values
  ('welcome', 'Welcome / verify email', 'Confirm your {{brand}} account',
   E'Hi {{first_name}},\n\nWelcome to {{brand}}. Confirm your email address to continue setting up your account:\n\n{{verify_url}}\n\nThis is a demonstration environment — no real trading account is created.\n\n— The {{brand}} team',
   '{brand,first_name,verify_url}'),
  ('kyc_approved', 'KYC approved', 'Your {{brand}} verification is complete',
   E'Hi {{first_name}},\n\nYour identity verification has been approved. You can now request a trading account from your portal.\n\n{{portal_url}}\n\n— {{brand}} Compliance',
   '{brand,first_name,portal_url}'),
  ('kyc_rejected', 'KYC rejected', 'We could not verify your {{brand}} account',
   E'Hi {{first_name}},\n\nWe were unable to complete your verification. Reason given by our compliance team:\n\n{{reason}}\n\nYou can submit a new application from your portal.\n\n— {{brand}} Compliance',
   '{brand,first_name,reason}'),
  ('deposit_credited', 'Deposit credited', 'Your deposit of {{amount}} has been credited',
   E'Hi {{first_name}},\n\n{{amount}} has been credited to your {{brand}} wallet. Reference {{reference}}.\n\nSimulated funds — no real money moved.\n\n— {{brand}} Finance',
   '{brand,first_name,amount,reference}'),
  ('withdrawal_paid', 'Withdrawal paid', 'Your withdrawal of {{amount}} is on its way',
   E'Hi {{first_name}},\n\nYour withdrawal of {{amount}} has been approved and marked as paid. Reference {{reference}}.\n\n— {{brand}} Finance',
   '{brand,first_name,amount,reference}'),
  ('account_provisioned', 'Trading account ready', 'Your {{brand}} trading account is ready',
   E'Hi {{first_name}},\n\nYour {{account_type}} MT5 account is ready.\n\nLogin: {{mt5_login}}\nServer: {{mt5_server}}\n\n— {{brand}} Trading Operations',
   '{brand,first_name,account_type,mt5_login,mt5_server}');

alter table public.email_templates enable row level security;

create policy email_templates_select_staff on public.email_templates
  for select using (public.is_staff());

create policy email_templates_update_manager on public.email_templates
  for update using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));

-- ---------------------------------------------------------------------------
-- Client account state that operations owns (as opposed to the client's own
-- profile fields).
-- ---------------------------------------------------------------------------
create type public.client_account_status as enum ('active', 'restricted', 'suspended', 'closed');
create type public.client_risk_rating as enum ('low', 'medium', 'high');

alter table public.profiles
  add column if not exists account_status public.client_account_status not null default 'active',
  add column if not exists risk_rating public.client_risk_rating not null default 'low',
  add column if not exists referral_code text unique,
  add column if not exists last_login_at timestamptz,
  add column if not exists two_factor_enabled boolean not null default false;

comment on column public.profiles.account_status is
  'Operations-owned restriction state. Set only by staff holding client.manage; a client can never change their own. Gates money movement in src/domain/finance.';

-- A stable, shareable referral code per client, generated in the database
-- so no application path can create a client without one.
create or replace function public.assign_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referral_code is null then
    new.referral_code := 'AM-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  end if;
  return new;
end;
$$;

revoke execute on function public.assign_referral_code() from public, anon, authenticated;

create trigger profiles_assign_referral_code
  before insert on public.profiles
  for each row execute function public.assign_referral_code();

update public.profiles
set referral_code = 'AM-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
where referral_code is null;

-- Staff notes on a client record — a compliance/support habit, kept
-- append-only so a note can be added but never quietly rewritten.
create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  author_role text not null,
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index client_notes_client_idx on public.client_notes (client_id, created_at desc);

alter table public.client_notes enable row level security;

-- Deliberately no client-facing select policy: internal notes are internal.
create policy client_notes_select_staff on public.client_notes
  for select using (public.has_permission('client.view'));

create policy client_notes_insert_staff on public.client_notes
  for insert with check (author_id = auth.uid() and public.has_permission('client.manage'));

-- Staff need to write the columns they own on a client record.
create policy profiles_update_staff_manager on public.profiles
  for update using (public.has_permission('client.manage'))
  with check (public.has_permission('client.manage'));

-- ---------------------------------------------------------------------------
-- Sign-in evidence and device list. Supabase Auth owns the session itself;
-- this is the human-readable trail the portal's Security page shows and
-- the admin console can audit.
-- ---------------------------------------------------------------------------
create type public.login_event_kind as enum ('sign_in', 'sign_out', 'failed_password', 'mfa_challenge', 'password_changed', 'session_revoked');

create table public.login_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  email text not null,
  kind public.login_event_kind not null,
  ip_address text,
  user_agent text,
  location_label text,
  created_at timestamptz not null default now()
);

create index login_events_profile_idx on public.login_events (profile_id, created_at desc);

alter table public.login_events enable row level security;

create policy login_events_select_own on public.login_events
  for select using (profile_id = auth.uid());

create policy login_events_select_staff on public.login_events
  for select using (public.has_permission('audit.view'));

-- Written server-side (service role) at the auth boundary, so no insert
-- policy is granted to any user role.

-- Second-factor enrolment. No select policy for anyone, including the
-- owner: the shared secret leaves the database exactly once, in the
-- response to the enrolment server action that created it.
create table public.user_mfa (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  secret text not null,
  confirmed_at timestamptz,
  recovery_codes text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.user_mfa enable row level security;

comment on table public.user_mfa is
  'TOTP secrets. RLS is enabled with no policies at all — deliberately unreadable by any browser session, including the owner''s. Only the service role (server actions) touches it.';

-- ---------------------------------------------------------------------------
-- Growth activation: commission rules, IB state, referral attribution.
-- ---------------------------------------------------------------------------
create type public.commission_basis as enum ('deposit_bps', 'per_lot', 'flat');
create type public.ib_status as enum ('pending', 'active', 'suspended');

alter table public.introducing_brokers
  add column if not exists status public.ib_status not null default 'active',
  add column if not exists commission_bps integer not null default 150,
  add column if not exists applied_at timestamptz not null default now(),
  add column if not exists approved_by uuid references public.profiles (id);

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  basis public.commission_basis not null,
  -- Basis points for deposit_bps, currency amount for per_lot/flat.
  rate numeric(12, 4) not null check (rate >= 0),
  rank_id uuid references public.ranks (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger commission_rules_set_updated_at
  before update on public.commission_rules
  for each row execute function public.set_updated_at();

alter table public.commission_rules enable row level security;

create policy commission_rules_select_authenticated on public.commission_rules
  for select using (auth.uid() is not null);

create policy commission_rules_write_manager on public.commission_rules
  for all using (public.has_permission('commission.manage'))
  with check (public.has_permission('commission.manage'));

alter table public.commissions
  add column if not exists source_client_id uuid references public.profiles (id),
  add column if not exists basis public.commission_basis not null default 'deposit_bps',
  add column if not exists rule_id uuid references public.commission_rules (id),
  add column if not exists paid_transaction_id uuid references public.transactions (id),
  add column if not exists approved_by uuid references public.profiles (id),
  add column if not exists decided_at timestamptz;

alter table public.rebates
  add column if not exists paid_transaction_id uuid references public.transactions (id);

create policy commissions_update_manager on public.commissions
  for update using (public.has_permission('commission.manage'))
  with check (public.has_permission('commission.manage'));

create policy introducing_brokers_write_manager on public.introducing_brokers
  for all using (public.has_permission('referral.manage'))
  with check (public.has_permission('referral.manage'));

create policy referral_relationships_write_manager on public.referral_relationships
  for all using (public.has_permission('referral.manage'))
  with check (public.has_permission('referral.manage'));

insert into public.ranks (key, name, min_referred_volume, benefits, sort_order) values
  ('bronze',   'Bronze Partner',   0,       '{"commission_bps": 150, "payout_frequency": "monthly"}'::jsonb, 1),
  ('silver',   'Silver Partner',   50000,   '{"commission_bps": 200, "payout_frequency": "monthly"}'::jsonb, 2),
  ('gold',     'Gold Partner',     250000,  '{"commission_bps": 275, "payout_frequency": "fortnightly", "dedicated_manager": true}'::jsonb, 3),
  ('platinum', 'Platinum Partner', 1000000, '{"commission_bps": 350, "payout_frequency": "weekly", "dedicated_manager": true}'::jsonb, 4)
on conflict (key) do nothing;

insert into public.commission_rules (name, basis, rate)
select 'Standard referral — 1.5% of net deposits', 'deposit_bps', 150
where not exists (select 1 from public.commission_rules);

-- ---------------------------------------------------------------------------
-- Support routing.
-- ---------------------------------------------------------------------------
alter table public.support_tickets
  add column if not exists assigned_to uuid references public.profiles (id),
  add column if not exists category text not null default 'general',
  add column if not exists reference_code text,
  add column if not exists resolved_at timestamptz,
  add column if not exists first_response_at timestamptz;

create or replace function public.assign_ticket_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference_code is null then
    new.reference_code := 'TKT-' || to_char(now(), 'YYMM') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  end if;
  return new;
end;
$$;

revoke execute on function public.assign_ticket_reference() from public, anon, authenticated;

create trigger support_tickets_assign_reference
  before insert on public.support_tickets
  for each row execute function public.assign_ticket_reference();

update public.support_tickets
set reference_code = 'TKT-' || to_char(created_at, 'YYMM') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5))
where reference_code is null;

-- Clients reopen/close their own tickets by replying; staff route them.
create policy support_tickets_update_own on public.support_tickets
  for update using (client_id = auth.uid())
  with check (client_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Staff administration: role assignment and the role/permission matrix.
-- ---------------------------------------------------------------------------
create policy staff_role_assignments_write_manager on public.staff_role_assignments
  for all using (public.has_permission('staff.manage'))
  with check (public.has_permission('staff.manage'));

create policy role_permissions_write_manager on public.role_permissions
  for all using (public.has_permission('role.manage'))
  with check (public.has_permission('role.manage'));

create policy roles_write_manager on public.roles
  for all using (public.has_permission('role.manage'))
  with check (public.has_permission('role.manage'));

-- ---------------------------------------------------------------------------
-- Trading operations need to move an account through provisioning and
-- manage its lifecycle; the client may only ever create the request.
-- ---------------------------------------------------------------------------
create policy trading_accounts_update_staff on public.trading_accounts
  for update using (public.has_permission('trading_account.provision') or public.has_permission('trading_account.manage'))
  with check (public.has_permission('trading_account.provision') or public.has_permission('trading_account.manage'));

alter table public.trading_accounts
  add column if not exists nickname text,
  add column if not exists approved_by uuid references public.profiles (id),
  add column if not exists suspension_reason text;

-- ---------------------------------------------------------------------------
-- KYC: analysts need to claim a case, record review progress, and mark
-- individual documents accepted or rejected. The case UPDATE policy
-- already exists (compliance migration); these are the columns and the
-- document-level policy it was missing.
-- ---------------------------------------------------------------------------
create type public.kyc_document_review_status as enum ('pending', 'accepted', 'rejected');

alter table public.kyc_cases
  add column if not exists analyst_id uuid references public.profiles (id),
  add column if not exists claimed_at timestamptz,
  add column if not exists internal_notes text,
  add column if not exists risk_flags text[] not null default '{}';

alter table public.kyc_documents
  add column if not exists review_status public.kyc_document_review_status not null default 'pending',
  add column if not exists reviewed_by uuid references public.profiles (id),
  add column if not exists review_note text;

create policy kyc_documents_update_reviewer on public.kyc_documents
  for update using (public.has_permission('kyc.review'))
  with check (public.has_permission('kyc.review'));
