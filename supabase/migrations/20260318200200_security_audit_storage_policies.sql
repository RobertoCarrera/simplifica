-- ============================================================
-- SECURITY AUDIT: Tighten storage bucket RLS policies
-- Date: 2026-03-18
-- Risk: HIGH — Current policies allow any authenticated user to
--        read/write/delete files in ANY company's namespace.
--        Storage paths should enforce company-level isolation.
-- NOTE: Skipped when storage schema doesn't exist (local dev)
-- ============================================================
DO $$
BEGIN
  -- Guard: skip entirely if storage schema not present
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'Storage schema not found, skipping storage RLS policy migration';
    RETURN;
  END IF;

  -- ---- public-assets bucket ----
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can upload public assets" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Users can update own public assets" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Users can delete own public assets" ON storage.objects';

  EXECUTE $q$CREATE POLICY "Users can upload to own company folder in public-assets"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'public-assets' AND (storage.foldername(name))[1] = public.get_user_company_id()::text)$q$;

  EXECUTE $q$CREATE POLICY "Users can update own company assets"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'public-assets' AND (storage.foldername(name))[1] = public.get_user_company_id()::text)$q$;

  EXECUTE $q$CREATE POLICY "Users can delete own company assets"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'public-assets' AND (storage.foldername(name))[1] = public.get_user_company_id()::text)$q$;

  -- ---- client-documents bucket ----
  EXECUTE 'DROP POLICY IF EXISTS "Give users access to bucket Select" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Give users access to bucket Insert" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Give users access to bucket Delete" ON storage.objects';

  EXECUTE $q$CREATE POLICY "Users can view own company client documents"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'client-documents' AND (storage.foldername(name))[1] = public.get_user_company_id()::text)$q$;

  EXECUTE $q$CREATE POLICY "Users can upload own company client documents"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'client-documents' AND (storage.foldername(name))[1] = public.get_user_company_id()::text)$q$;

  EXECUTE $q$CREATE POLICY "Users can delete own company client documents"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'client-documents' AND (storage.foldername(name))[1] = public.get_user_company_id()::text)$q$;

  -- ---- project-files bucket ----
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can view project files" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can upload project files" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can delete project files" ON storage.objects';

  EXECUTE $q$CREATE POLICY "Users can view own company project files"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'project-files' AND (storage.foldername(name))[1] = public.get_user_company_id()::text)$q$;

  EXECUTE $q$CREATE POLICY "Users can upload own company project files"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'project-files' AND (storage.foldername(name))[1] = public.get_user_company_id()::text)$q$;

  EXECUTE $q$CREATE POLICY "Users can delete own company project files"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'project-files' AND (storage.foldername(name))[1] = public.get_user_company_id()::text)$q$;

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'security_audit_storage_policies: skipped — %', SQLERRM;
END $$;
