-- Storage policies for attachments bucket (comments images upload)
-- Enable RLS on storage.objects is already managed by Supabase.
-- This script creates policies to allow authenticated users to upload to
-- attachments bucket under tickets/<ticket_id>/comments/* and read.

begin;

-- Drop old policies if present to avoid duplication errors
drop policy if exists "attachments_upload_tickets_comments" on storage.objects;
drop policy if exists "attachments_update" on storage.objects;
drop policy if exists "attachments_delete" on storage.objects;
drop policy if exists "attachments_public_read" on storage.objects;

-- Allow authenticated users to create objects under attachments/tickets/*
-- Adjust conditions to enforce path pattern and company ownership if needed.
create policy "attachments_upload_tickets_comments"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and name like 'tickets/%/comments/%'
  );

-- Allow owners to update/delete their objects if necessary
create policy "attachments_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'attachments')
  with check (bucket_id = 'attachments');

create policy "attachments_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'attachments');

-- Public read for attachments if using public URL
create policy "attachments_public_read"
  on storage.objects
  for select
  using (bucket_id = 'attachments');

commit;