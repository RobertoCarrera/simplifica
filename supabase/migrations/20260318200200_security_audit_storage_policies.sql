-- ============================================================
-- SECURITY AUDIT: Tighten storage bucket RLS policies
-- Date: 2026-03-18
-- Risk: HIGH — Current policies allow any authenticated user to
--        read/write/delete files in ANY company's namespace.
--        Storage paths should enforce company-level isolation.
-- ============================================================

-- ---- public-assets bucket ----
-- Drop overly permissive upload policy
DROP POLICY IF EXISTS "Authenticated users can upload public assets" ON storage.objects;

-- Replace with path-scoped upload: users must upload under their company folder
-- Path convention: public-assets/{company_id}/...
CREATE POLICY "Users can upload to own company folder in public-assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'public-assets'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

-- Drop overly permissive update/delete policies and replace
DROP POLICY IF EXISTS "Users can update own public assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own public assets" ON storage.objects;

CREATE POLICY "Users can update own company assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'public-assets'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

CREATE POLICY "Users can delete own company assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'public-assets'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

-- ---- client-documents bucket ----
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Give users access to bucket Select" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to bucket Insert" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to bucket Delete" ON storage.objects;

-- Replace with company-scoped policies
-- Path convention: client-documents/{company_id}/...
CREATE POLICY "Users can view own company client documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

CREATE POLICY "Users can upload own company client documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

CREATE POLICY "Users can delete own company client documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

-- ---- project-files bucket ----
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view project files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload project files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete project files" ON storage.objects;

-- Replace with company-scoped policies
-- Path convention: project-files/{company_id}/...
CREATE POLICY "Users can view own company project files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

CREATE POLICY "Users can upload own company project files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

CREATE POLICY "Users can delete own company project files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );
