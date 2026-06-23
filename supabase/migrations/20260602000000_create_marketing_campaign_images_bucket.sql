-- Create the marketing-campaign-images bucket for storing campaign-related images
-- This bucket is public-readable so SES can embed images via public URLs
DO $$
BEGIN
  -- Guard: skip entirely if storage schema not present
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'Storage schema not found, skipping marketing-campaign-images bucket creation';
    RETURN;
  END IF;

  -- Create bucket if not exists
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'marketing-campaign-images',
    'marketing-campaign-images',
    true,
    10485760, -- 10MB
    ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  )
  ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

  -- Drop existing policies first
  DROP POLICY IF EXISTS "Anyone can view marketing campaign images" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can upload marketing campaign images" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update own company marketing images" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete own company marketing images" ON storage.objects;

  -- Public read: anyone can view images (SES needs public access to embed)
  EXECUTE $p$CREATE POLICY "Anyone can view marketing campaign images"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'marketing-campaign-images')$p$;

  -- Upload: authenticated users can upload to their company folder
  EXECUTE $p$CREATE POLICY "Authenticated users can upload marketing campaign images"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'marketing-campaign-images'
      AND (storage.foldername(name))[1] = public.get_user_company_id()::text
    )$p$;

  -- Update: users can update own company assets
  EXECUTE $p$CREATE POLICY "Users can update own company marketing images"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'marketing-campaign-images'
      AND (storage.foldername(name))[1] = public.get_user_company_id()::text
    )
    WITH CHECK (
      bucket_id = 'marketing-campaign-images'
      AND (storage.foldername(name))[1] = public.get_user_company_id()::text
    )$p$;

  -- Delete: users can delete own company assets
  EXECUTE $p$CREATE POLICY "Users can delete own company marketing images"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'marketing-campaign-images'
      AND (storage.foldername(name))[1] = public.get_user_company_id()::text
    )$p$;

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'create_marketing_campaign_images_bucket: skipped — %', SQLERRM;
END $$;