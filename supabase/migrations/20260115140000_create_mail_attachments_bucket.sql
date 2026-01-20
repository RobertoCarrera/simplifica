-- Migration: Create Mail Attachments Bucket
-- Date: 2026-01-15

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('mail-attachments', 'mail-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users to upload their own attachments
CREATE POLICY "Users can upload mail attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'mail-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy to allow authenticated users to read their own attachments
CREATE POLICY "Users can view their own mail attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'mail-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy to allow authenticated users to delete their own attachments
CREATE POLICY "Users can delete their own mail attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'mail-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
