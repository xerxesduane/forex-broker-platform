-- Operations: support tickets and notifications.
-- Notifications are lightly wired in slice 1 (system-generated, e.g. "KYC
-- approved", "demo account ready"); support tickets are foundation/IA
-- only in this pass (Phase 5, per docs/product-plan.md section 3).

create type public.support_ticket_status as enum ('open', 'pending', 'resolved', 'closed');
create type public.support_ticket_priority as enum ('low', 'medium', 'high');

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  status public.support_ticket_status not null default 'open',
  priority public.support_ticket_priority not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  author_role text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type text not null, -- e.g. 'kyc_approved', 'trading_account_provisioned'
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_profile_idx on public.notifications (profile_id, created_at desc);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.notifications enable row level security;

create policy support_tickets_select_own on public.support_tickets for select using (client_id = auth.uid());
create policy support_tickets_insert_own on public.support_tickets for insert with check (client_id = auth.uid());
create policy support_tickets_select_staff on public.support_tickets for select using (public.has_permission('support.view'));
create policy support_tickets_update_staff on public.support_tickets for update using (public.has_permission('support.manage'));

create policy support_ticket_messages_select_participant on public.support_ticket_messages
  for select using (
    exists (select 1 from public.support_tickets t where t.id = ticket_id and t.client_id = auth.uid())
    or public.has_permission('support.view')
  );
create policy support_ticket_messages_insert_participant on public.support_ticket_messages
  for insert with check (
    author_id = auth.uid()
    and (
      exists (select 1 from public.support_tickets t where t.id = ticket_id and t.client_id = auth.uid())
      or public.has_permission('support.manage')
    )
  );

-- Notifications are written server-side (service role, bypassing RLS) by
-- the domain that generates them (e.g. KYC decision, account
-- provisioning) — no insert policy is granted to regular users.
create policy notifications_select_own on public.notifications for select using (profile_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
