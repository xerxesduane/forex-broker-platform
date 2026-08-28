-- Compliance: KYC cases and document metadata.
-- Ownership boundary: this file owns KYC cases, document metadata,
-- decisions, reviewers and (future) retention flags. It does not own
-- trading eligibility rules beyond exposing status for other domains to
-- read (see docs/product-plan.md section 5).
--
-- Demo scope: "documents" are metadata only, accepted through the
-- simulated document-storage adapter. No real identity documents are
-- collected — see docs/assumptions.md.

create table public.kyc_cases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  status public.kyc_status not null default 'submitted',
  employment_status text,
  source_of_funds text,
  declared_country text,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id),
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kyc_cases is
  'A demo KYC submission and its review lifecycle. status transitions are enforced by the domain state machine in src/domain/kyc, not by this table alone.';

-- At most one case "in flight" (submitted/in_review/needs_revision) per
-- client — prevents duplicate concurrent submissions at the data layer,
-- not just in the UI.
create unique index kyc_cases_one_active_per_client
  on public.kyc_cases (client_id)
  where status in ('submitted', 'in_review', 'needs_revision');

create index kyc_cases_status_idx on public.kyc_cases (status, submitted_at);

create trigger kyc_cases_set_updated_at
  before update on public.kyc_cases
  for each row execute function public.set_updated_at();

create table public.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  kyc_case_id uuid not null references public.kyc_cases (id) on delete cascade,
  doc_type text not null, -- 'identity_document' | 'proof_of_address' | ...
  storage_path text not null, -- opaque key into the document-storage adapter
  original_filename text not null,
  content_type text not null,
  size_bytes integer not null,
  uploaded_at timestamptz not null default now()
);

create index kyc_documents_case_idx on public.kyc_documents (kyc_case_id);

-- Keep profiles.kyc_status in sync with the client's latest kyc_cases row.
-- Single writer for that denormalized column (see profiles migration).
create or replace function public.sync_profile_kyc_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set kyc_status = new.status
  where id = new.client_id;
  return new;
end;
$$;

create trigger kyc_cases_sync_profile_status
  after insert or update of status on public.kyc_cases
  for each row execute function public.sync_profile_kyc_status();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.kyc_cases enable row level security;
alter table public.kyc_documents enable row level security;

create policy kyc_cases_select_own on public.kyc_cases
  for select using (client_id = auth.uid());

create policy kyc_cases_insert_own on public.kyc_cases
  for insert with check (client_id = auth.uid());

create policy kyc_cases_select_staff on public.kyc_cases
  for select using (public.has_permission('kyc.view'));

create policy kyc_cases_update_staff on public.kyc_cases
  for update using (public.has_permission('kyc.review') or public.has_permission('kyc.decide'));

create policy kyc_documents_select_own on public.kyc_documents
  for select using (
    exists (
      select 1 from public.kyc_cases c
      where c.id = kyc_case_id and c.client_id = auth.uid()
    )
  );

create policy kyc_documents_insert_own on public.kyc_documents
  for insert with check (
    exists (
      select 1 from public.kyc_cases c
      where c.id = kyc_case_id and c.client_id = auth.uid()
    )
  );

create policy kyc_documents_select_staff on public.kyc_documents
  for select using (public.has_permission('kyc.view'));
