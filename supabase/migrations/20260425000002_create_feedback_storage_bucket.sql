-- Migration: Create feedback_attachments storage bucket
-- Date: 2026-04-25

-- Insert bucket (storage buckets go into the storage schema, not public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'feedback_attachments',
    'feedback_attachments',
    false,
    1048576,  -- 1MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: authenticated users can upload feedback attachments
-- (bucket is private; only uploads allowed, no public reads)
CREATE POLICY "feedback_attachments_upload" ON storage.objects
FOR INSERT WITH CHECK (
    bucket_id = 'feedback_attachments'
    AND auth.role() = 'authenticated'
);

-- Policy: service role can read (edge function needs to read for signed URL generation)
CREATE POLICY "feedback_attachments_service_read" ON storage.objects
FOR SELECT USING (
    bucket_id = 'feedback_attachments'
    AND auth.role() = 'service_role'
);

-- Policy: service role can delete (cleanup)
CREATE POLICY "feedback_attachments_service_delete" ON storage.objects
FOR DELETE USING (
    bucket_id = 'feedback_attachments'
    AND auth.role() = 'service_role'
);
