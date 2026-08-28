-- Private document storage for the simulated KYC document adapter.
-- Bucket is private (public = false): every read goes through a
-- short-lived signed URL minted server-side, never a public path.
-- See src/lib/adapters/document-storage.

insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;

-- Object path convention: {client_id}/{kyc_case_id}/{filename}. Policies
-- key off the leading {client_id} path segment so a client can only
-- reach their own folder, and staff need an explicit kyc.view permission.

create policy kyc_documents_storage_insert_own on storage.objects
  for insert
  with check (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy kyc_documents_storage_select_own on storage.objects
  for select
  using (
    bucket_id = 'kyc-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy kyc_documents_storage_select_staff on storage.objects
  for select
  using (
    bucket_id = 'kyc-documents'
    and public.has_permission('kyc.view')
  );
