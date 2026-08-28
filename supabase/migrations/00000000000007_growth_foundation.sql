-- Growth foundation: referrals, Introducing Brokers, commissions, rebates, ranks.
-- Ownership boundary: owns referral relationships, commission rules,
-- ranking definitions and reward events (docs/product-plan.md section 5).
-- FOUNDATION ONLY in this pass — see note in the finance-foundation
-- migration; the same reasoning applies here (Phase 5, per the plan).

create type public.reward_status as enum ('pending', 'approved', 'paid', 'void');

create table public.ranks (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  min_referred_volume numeric(18, 2) not null default 0,
  benefits jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0
);

create table public.introducing_brokers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  ib_code text not null unique,
  rank_id uuid references public.ranks (id),
  created_at timestamptz not null default now()
);

create table public.referral_relationships (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id),
  referee_id uuid not null unique references public.profiles (id),
  ib_id uuid references public.introducing_brokers (id),
  created_at timestamptz not null default now(),
  check (referrer_id <> referee_id)
);

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  ib_id uuid not null references public.introducing_brokers (id),
  source_transaction_id uuid references public.transactions (id),
  amount numeric(18, 2) not null check (amount >= 0),
  currency text not null,
  status public.reward_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.rebates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id),
  source_transaction_id uuid references public.transactions (id),
  amount numeric(18, 2) not null check (amount >= 0),
  currency text not null,
  status public.reward_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index referral_relationships_referrer_idx on public.referral_relationships (referrer_id);
create index commissions_ib_idx on public.commissions (ib_id, status);
create index rebates_client_idx on public.rebates (client_id, status);

alter table public.ranks enable row level security;
alter table public.introducing_brokers enable row level security;
alter table public.referral_relationships enable row level security;
alter table public.commissions enable row level security;
alter table public.rebates enable row level security;

create policy ranks_select_authenticated on public.ranks for select using (auth.uid() is not null);

create policy introducing_brokers_select_own on public.introducing_brokers for select using (profile_id = auth.uid());
create policy introducing_brokers_select_staff on public.introducing_brokers for select using (public.has_permission('referral.manage'));

create policy referral_relationships_select_own on public.referral_relationships
  for select using (referrer_id = auth.uid() or referee_id = auth.uid());
create policy referral_relationships_select_staff on public.referral_relationships
  for select using (public.has_permission('referral.manage'));

create policy commissions_select_own on public.commissions
  for select using (exists (
    select 1 from public.introducing_brokers ib where ib.id = ib_id and ib.profile_id = auth.uid()
  ));
create policy commissions_select_staff on public.commissions for select using (public.has_permission('commission.manage'));

create policy rebates_select_own on public.rebates for select using (client_id = auth.uid());
create policy rebates_select_staff on public.rebates for select using (public.has_permission('commission.manage'));
