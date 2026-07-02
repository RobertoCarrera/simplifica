-- Rafter ops v0.58: fix 2 cross-tenant storage data leaks
--
-- Storage multi-tenant audit 2026-06-29 found two Supabase Storage buckets
-- where the SELECT policy was {public} with only a bucket_id check, allowing
-- any anonymous user to list/read any tenant's files via:
--   GET /storage/v1/object/list/contracts
--   GET /storage/v1/object/list/ticket-attachments
--   GET /storage/v1/object/{bucket}/{name}
--
-- Buckets affected:
--   1. contracts            - signed contract PDFs of all tenants world-readable
--   2. ticket-attachments   - ticket attachments of all tenants world-readable
--
-- Fix:
--   - Change role from {public} to {authenticated} on both SELECT policies.
--   - Add a tenant-isolation check that maps the storage path back to a
--     company_id and compares against the caller's company.
--
-- Path conventions (verified in app code):
--   - contracts upload path:        {company_id}/{contract_id}_signed.pdf
--   - ticket-attachments upload path: {ticket_id}/{ts}_{name}
--                                    or temp/{ts}_{name}  (in-flight wizard)
--
-- For contracts the first folder IS the company_id, so a direct equality
-- check on storage.foldername(name)[1] is sufficient.
--
-- For ticket-attachments the first folder is a ticket_id, so we look up
-- the ticket's company_id via public.tickets and compare. Files uploaded
-- to a "temp/" prefix (before the ticket is created) are restricted to
-- authenticated users only — the path includes a millisecond timestamp
-- so guessing other tenants' temp files is impractical, and this matches
-- the upload code's intent (in-flight wizard preview).
--
-- Helper function public.get_user_company_id() takes NO arguments and reads
-- auth.uid() internally (it also accepts a JWT-claim shortcut). It returns
-- uuid and is the canonical "current tenant" resolver across this codebase.
--
-- Companion to Rafter v0.57 (SECDEF auth-bypass fixes) — first batch of
-- the v0.58 multi-tenant data-leak series.

BEGIN;

-- ============================================================================
-- 1) contracts bucket
-- ============================================================================
-- Was: {public} USING (bucket_id = 'contracts'::text)
-- Now: {authenticated} AND the first folder of the object name must equal
--      the caller's company_id (uuid::text for the text[] -> text comparison).
DROP POLICY IF EXISTS "Users can view contract PDFs" ON storage.objects;

CREATE POLICY "Users can view contract PDFs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'contracts'
    AND (storage.foldername(name))[1] = (
      SELECT public.get_user_company_id()::text
    )
  );

-- ============================================================================
-- 2) ticket-attachments bucket
-- ============================================================================
-- Was: {public} USING (bucket_id = 'ticket-attachments'::text)
-- Now: {authenticated} AND
--        - if the first folder is "temp" (wizard pre-create), any auth user
--        - else the first folder is a ticket_id; caller must belong to the
--          ticket's company.
DROP POLICY IF EXISTS "Anyone can view ticket attachments" ON storage.objects;

CREATE POLICY "Anyone can view ticket attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND (
      (storage.foldername(name))[1] = 'temp'
      OR EXISTS (
        SELECT 1
        FROM public.tickets t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.company_id = public.get_user_company_id()
      )
    )
  );

COMMIT;
