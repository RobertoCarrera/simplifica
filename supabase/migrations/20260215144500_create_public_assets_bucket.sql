-- Create the public-assets bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

-- Set up proper RLS policies for the bucket

-- 1. Allow public read access to everyone
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'public-assets' );

-- 2. Allow authenticated users to upload files (logos)
-- We restrict this to authenticated users. 
-- In a more strict environment, we might want to check for specific roles, 
-- but for now, any logged-in user with a company should be able to upload their logo.
create policy "Authenticated users can upload public assets"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'public-assets' );

-- 3. Allow users to update their own uploads (optional, but good for re-uploading)
create policy "Users can update their own public assets"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'public-assets' and owner = auth.uid() );

-- 4. Allow users to delete their own uploads
create policy "Users can delete their own public assets"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'public-assets' and owner = auth.uid() );
