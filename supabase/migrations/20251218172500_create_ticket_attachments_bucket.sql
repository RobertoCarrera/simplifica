-- Create the ticket-attachments bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', true)
on conflict (id) do nothing;

-- Policy to allow authenticated users to upload files
create policy "Authenticated users can upload ticket attachments"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'ticket-attachments' );

-- Policy to allow everyone to view files (since it's a public bucket)
create policy "Anyone can view ticket attachments"
on storage.objects for select
to public
using ( bucket_id = 'ticket-attachments' );
