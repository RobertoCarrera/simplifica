-- Rafter v0.59: tighten INSERT/UPDATE on storage to require tenant isolation.
-- Closes the cross-tenant WRITE hole left after v0.58 part 1 fixed only SELECT.
--
-- Context:
-- - v0.58 (migration 20260629_fix_storage_tenant_policies.sql, commit 711c8de4)
--   tightened SELECT on `contracts` and `ticket-attachments` buckets. The
--   companion INSERT/UPDATE policies still only checked `bucket_id` and the
--   `authenticated` role, so an authenticated Company A user could upload a
--   file to Company B's storage path (e.g. {company_id_B}/contract.pdf) and
--   then read it back via the SELECT fix. The fix: same path-based tenant
--   check as the v0.58 SELECT policy.
--
-- Path conventions (verified in source 2026-06-29):
--   contracts:        {company_id}/{contractId}_signed.pdf
--   ticket-attachments: {ticket_id}/{ts}_{name}  OR  temp/{ts}_{name}
--
-- RLS pattern (matches v0.58 SELECT for the same buckets):
--   contracts:
--     (storage.foldername(name))[1] = (get_user_company_id())::text
--   ticket-attachments:
--     (storage.foldername(name))[1] = 'temp'::text  -- wizard pre-create
--     OR EXISTS (SELECT 1 FROM tickets t
--                WHERE t.id::text = (storage.foldername(name))[1]
--                  AND t.company_id = get_user_company_id())

BEGIN;

-- ============================================================================
-- contracts bucket: INSERT/UPDATE
-- ============================================================================

DROP POLICY IF EXISTS "Clients can upload signed contract PDFs" ON storage.objects;
CREATE POLICY "Clients can upload signed contract PDFs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contracts'
    AND (storage.foldername(name))[1] = (get_user_company_id())::text
  );

DROP POLICY IF EXISTS "Clients can update signed contract PDFs" ON storage.objects;
CREATE POLICY "Clients can update signed contract PDFs" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contracts'
    AND (storage.foldername(name))[1] = (get_user_company_id())::text
  )
  WITH CHECK (
    bucket_id = 'contracts'
    AND (storage.foldername(name))[1] = (get_user_company_id())::text
  );

-- ============================================================================
-- ticket-attachments bucket: INSERT/UPDATE
-- ============================================================================
-- Path is {ticket_id}/{ts}_{name} (or temp/...). Cannot use company_id from
-- path. Join to tickets table to look up the parent ticket's company.
-- Mirrors the v0.58 SELECT policy: 'temp' folder (wizard pre-create) is
-- accepted for any authenticated user; otherwise the ticket must belong to
-- the caller's company.

DROP POLICY IF EXISTS "Authenticated users can upload ticket attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload ticket attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND (
      (storage.foldername(name))[1] = 'temp'
      OR EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.company_id = get_user_company_id()
      )
    )
  );

-- No UPDATE policy existed previously. Create one with the same scope as
-- INSERT so a user can't bypass the tenant check by UPDATEing a file.
DROP POLICY IF EXISTS "Authenticated users can update ticket attachments" ON storage.objects;
CREATE POLICY "Authenticated users can update ticket attachments" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND (
      (storage.foldername(name))[1] = 'temp'
      OR EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.company_id = get_user_company_id()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND (
      (storage.foldername(name))[1] = 'temp'
      OR EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.company_id = get_user_company_id()
      )
    )
  );

COMMIT;