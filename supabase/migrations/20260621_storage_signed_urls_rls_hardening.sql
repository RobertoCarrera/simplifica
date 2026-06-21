-- Migration: storage_signed_urls_rls_hardening
-- Sprint: Rafter v0.14.1 (defense-in-depth)
-- Date: 2026-06-21
--
-- Adds defense-in-depth RLS policies on 2 PRIVATE buckets that previously
-- relied solely on bucket privacy. The frontend was also using
-- .getPublicUrl() on these private buckets, which returned broken URLs
-- (no real PII leak today since both buckets have 0 objects, but the
-- stored URLs would be non-functional).
--
-- Buckets covered:
--   - professional-documents:  owner (professionals.user_id -> users.auth_user_id) only
--   - professional-signatures: owner (via professional_documents join) only
--
-- customer-avatars already has customer_avatars_authenticated_select — left alone.
--
-- Pattern mirrors supabase/migrations/20260413000005_tighten_booking_documents_storage_rls.sql
-- (EXISTS JOIN through DB tables, scoped to the calling auth.uid()).
--
-- Note: storage path conventions used by the frontend (verified in source):
--   professional-documents:  {professional_id}/{timestamp}_{uuid}.{ext}
--   professional-signatures: signatures/{document_id}_{timestamp}.png
--
-- Note: SELECT only. INSERT/UPDATE/DELETE were not in scope — these buckets
-- are 0-objects today; uploads are presumed to go through service_role or
-- edge functions. If uploads need to happen from anon keys, add matching
-- INSERT policies in a follow-up migration.

-- =============================================================================
-- 1. professional-documents: only the owning professional (via users.auth_user_id)
-- =============================================================================
DROP POLICY IF EXISTS "Owners can view their professional documents"
  ON storage.objects;

CREATE POLICY "Owners can view their professional documents"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'professional-documents'
    AND EXISTS (
        SELECT 1
        FROM public.professionals p
        JOIN public.users u ON u.id = p.user_id
        WHERE u.auth_user_id = auth.uid()
          AND storage.objects.name LIKE (p.id::text || '/%')
    )
);

-- =============================================================================
-- 2. professional-signatures: only the owning professional (via document -> professional)
--    Path is `signatures/{document_id}_{ts}.png` so we match on document_id prefix.
-- =============================================================================
DROP POLICY IF EXISTS "Owners can view their professional signatures"
  ON storage.objects;

CREATE POLICY "Owners can view their professional signatures"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'professional-signatures'
    AND EXISTS (
        SELECT 1
        FROM public.professional_documents pd
        JOIN public.professionals p ON p.id = pd.professional_id
        JOIN public.users u       ON u.id = p.user_id
        WHERE u.auth_user_id = auth.uid()
          AND storage.objects.name LIKE ('signatures/' || pd.id::text || '%')
    )
);
