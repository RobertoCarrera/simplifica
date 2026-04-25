-- Create the public-assets bucket if it doesn't exist (wrapped to skip gracefully if storage schema unavailable during local reset)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('public-assets', 'public-assets', true)
  ON CONFLICT (id) DO NOTHING;

  EXECUTE 'CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = ''public-assets'')';
  EXECUTE 'CREATE POLICY "Authenticated users can upload public assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''public-assets'')';
  EXECUTE 'CREATE POLICY "Users can update their own public assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''public-assets'' AND owner = auth.uid())';
  EXECUTE 'CREATE POLICY "Users can delete their own public assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''public-assets'' AND owner = auth.uid())';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'public_assets storage: skipped — %', SQLERRM;
END $$;
