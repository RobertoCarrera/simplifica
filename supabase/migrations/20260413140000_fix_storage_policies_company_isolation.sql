-- ============================================================
-- SECURITY FIX: Storage policies for client-documents and project-files
-- Date: 2026-04-13
-- Risk: CRITICAL — These buckets had NO company_id isolation.
--        Any authenticated user could access ANY company's files.
--
-- NOTE on public-assets bucket:
--   This bucket is INTENTIONALLY public for static assets (logos, etc).
--   Manual audit of its contents should be performed periodically to
--   ensure no sensitive data has been uploaded there.
-- ============================================================

-- ============================================================
-- STEP 1: client-documents bucket
-- ============================================================
-- The original policies (from 20260114200000_client_documents.sql)
-- had NO company_id filter, allowing cross-tenant access.
-- Policy names were: "Give users access to bucket Select/Insert/Delete"

-- Drop existing (broken) policies
DROP POLICY IF EXISTS "Give users access to bucket Select" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to bucket Insert" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to bucket Delete" ON storage.objects;

-- Create company-scoped policies
-- Path convention: client-documents/{company_id}/...
CREATE POLICY "client_documents_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

CREATE POLICY "client_documents_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

CREATE POLICY "client_documents_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

-- ============================================================
-- STEP 2: project-files bucket
-- ============================================================
-- The original policies (from 20260213000000_project_files.sql)
-- had NO company_id filter, allowing cross-tenant access.
-- Policy names were: "Give users access to bucket Select/Insert/Delete"

-- Drop existing (broken) policies
DROP POLICY IF EXISTS "Give users access to bucket Select" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to bucket Insert" ON storage.objects;
DROP POLICY IF EXISTS "Give users access to bucket Delete" ON storage.objects;

-- Create company-scoped policies
-- Path convention: project-files/{company_id}/...
CREATE POLICY "project_files_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

CREATE POLICY "project_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

CREATE POLICY "project_files_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (storage.foldername(name))[1] = public.get_user_company_id()::text
  );

-- ============================================================
-- NOTE: public-assets bucket
-- ============================================================
-- This bucket remains intentionally public for static assets.
-- Policies were last reviewed in 20260318200200_security_audit_storage_policies.sql
-- Manual periodic audit of contents is RECOMMENDED.