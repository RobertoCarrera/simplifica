-- Migration: Add 'docs-media' storage bucket for article body assets.
--
-- The docs admin editor needs to attach images (including .gif) and short
-- videos to article bodies. We use a dedicated public bucket so the URLs
-- can be embedded directly as <img src> / <video src> without needing
-- signed URL rotation on every render.
--
-- The bucket is gated by RLS the same way docs_categories / docs_articles
-- writes are: only super_admin can upload / delete / update. Anyone with
-- an authenticated JWT can read (matches the docs read model).
--
-- File-size cap is 50 MB to accommodate short demo videos (mp4/webm).
-- The MIME allowlist is deliberately narrow: only the formats the editor
-- actually renders, no SVGs (XSS surface), no executables.

-- 1) Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'docs-media',
  'docs-media',
  true,
  52428800, -- 50 MB
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) RLS: super_admin can write; authenticated can read.
--    The bucket is public so URL fetches don't need a JWT, but the
--    storage.objects RLS still applies to upload/delete/update ops.

DROP POLICY IF EXISTS docs_media_super_admin_write ON storage.objects;
CREATE POLICY docs_media_super_admin_write
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'docs-media'
    AND public.current_user_role() = 'super_admin'
  )
  WITH CHECK (
    bucket_id = 'docs-media'
    AND public.current_user_role() = 'super_admin'
  );
