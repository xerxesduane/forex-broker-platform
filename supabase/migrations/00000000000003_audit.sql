-- Audit: append-only evidence trail. Every domain writes here; nothing
-- reads it back for business logic (see docs/product-plan.md section 5).
-- No UPDATE/DELETE grants are issued anywhere in this schema for this
-- table — it is insert + select only, enforced by RLS below and by never
-- granting UPDATE/DELETE privileges to the application role.

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  actor_role text not null, -- snapshot of the acting role/kind at the time (roles can change later)
  action text not null, -- e.g. 'kyc.decide', 'trading_account.provision'
  entity_type text not null, -- e.g. 'kyc_case', 'trading_account'
  entity_id uuid not null,
  reason text,
  correlation_id uuid not null default gen_random_uuid(),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, created_at desc);
create index audit_events_correlation_idx on public.audit_events (correlation_id);
create index audit_events_actor_idx on public.audit_events (actor_id, created_at desc);

alter table public.audit_events enable row level security;

create policy audit_events_select_staff on public.audit_events
  for select using (public.has_permission('audit.view'));

create policy audit_events_insert_authenticated on public.audit_events
  for insert with check (auth.uid() is not null);

-- No update/delete policy is created deliberately: RLS defaults to deny,
-- so audit_events is append-only for every role, including staff.

-- ---------------------------------------------------------------------------
-- Integration events: one row per outbound/inbound call through an
-- adapter (MT5, KYC provider, payments, email, SMS, document storage).
-- Used for idempotency, reconciliation and "integration status" views.
-- See ADR 0005.
-- ---------------------------------------------------------------------------

create type public.integration_event_status as enum ('succeeded', 'failed', 'pending');

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  adapter text not null, -- 'mt5' | 'kyc_provider' | 'payments' | 'email' | 'sms' | 'document_storage'
  event_type text not null, -- e.g. 'provision_demo_account', 'send_verification_email'
  idempotency_key text not null,
  status public.integration_event_status not null default 'pending',
  simulation boolean not null default true,
  request_summary jsonb,
  response_summary jsonb,
  error_code text,
  error_message text,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (adapter, idempotency_key)
);

create index integration_events_related_idx on public.integration_events (related_entity_type, related_entity_id);

alter table public.integration_events enable row level security;

create policy integration_events_select_staff on public.integration_events
  for select using (public.has_permission('integration.view') or public.has_permission('audit.view'));

create policy integration_events_insert_authenticated on public.integration_events
  for insert with check (auth.uid() is not null);
