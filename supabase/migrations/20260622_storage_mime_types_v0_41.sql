-- Migration: storage_mime_types_v0_41
-- Date:      2026-06-23
-- Purpose:   Rafter v0.41 — tighten allowed_mime_types and file_size_limit on
--            private storage buckets. Defense-in-depth against malicious upload
--            (e.g. HTML/SVG with embedded JS, executables) + storage cost control.
--
-- Background
-- ----------
-- 8 private buckets in `storage.buckets` currently allow ANY file type with
-- NO size limit. The Supabase audit flagged this as a defense-in-depth gap.
-- This migration sets content-aware MIME allow-lists and reasonable per-bucket
-- size caps, matching the actual usage of each bucket (identified by name).
--
-- Mapping (bucket → purpose → MIME types → size cap)
-- ----------------------------------------------------
--   attachments             : mixed inbound attachments  : pdf + jpeg/png/webp           : 10MB
--   booking-documents       : per-booking uploaded docs  : pdf + jpeg/png/webp           : 10MB
--   client-documents        : client CRM documents      : pdf + jpeg/png/webp           : 15MB
--   contracts               : signed company contracts   : application/pdf              : 10MB
--   customer-avatars        : client profile photos      : jpeg + png + webp            : 5MB
--   invoices                : invoice PDFs               : application/pdf              : 10MB
--   professional-documents  : professional docs          : pdf + jpeg/png               : 10MB
--   professional-signatures : signature pads             : svg+xml + png                : 1MB
--   project-files           : project attachments        : pdf + jpeg/png/webp + office : 15MB
--   quotes                  : quote PDFs                 : application/pdf              : 10MB
--
-- Already configured (NOT touched by this migration):
--   feedback_attachments    : 1MB / jpeg+png+webp
--   hr-documents            : 10MB / pdf+jpeg+png
--   marketing-campaign-images (PUBLIC): 10MB / image
--   docs-media              (PUBLIC): 50MB / image+video
--
-- Public buckets intentionally left unchanged (any file type allowed by design):
--   device-images, mail-attachments, professional-avatars, public-assets, ticket-attachments
--
-- Buckets named in the audit but NOT present in this project (skipped, no creation):
--   company-assets, company-contracts, client-photos, client-signatures,
--   invoice-assets, payment-receipts, service-images

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- attachments (generic inbound attachments, e.g. mail + ticket uploads)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[],
       file_size_limit    = 10485760  -- 10 MiB
 WHERE name = 'attachments';

-- ─────────────────────────────────────────────────────────────────────────────
-- booking-documents (already has size limit; add MIME allow-list)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[]
 WHERE name = 'booking-documents';

-- ─────────────────────────────────────────────────────────────────────────────
-- client-documents (mixed CRM documents per client)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[],
       file_size_limit    = 15728640  -- 15 MiB
 WHERE name = 'client-documents';

-- ─────────────────────────────────────────────────────────────────────────────
-- contracts (signed company contracts — PDFs only)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['application/pdf']::text[],
       file_size_limit    = 10485760  -- 10 MiB
 WHERE name = 'contracts';

-- ─────────────────────────────────────────────────────────────────────────────
-- customer-avatars (client profile photos)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[],
       file_size_limit    = 5242880   -- 5 MiB
 WHERE name = 'customer-avatars';

-- ─────────────────────────────────────────────────────────────────────────────
-- invoices (invoice PDFs)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['application/pdf']::text[],
       file_size_limit    = 10485760  -- 10 MiB
 WHERE name = 'invoices';

-- ─────────────────────────────────────────────────────────────────────────────
-- professional-documents (per-professional docs)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png']::text[],
       file_size_limit    = 10485760  -- 10 MiB
 WHERE name = 'professional-documents';

-- ─────────────────────────────────────────────────────────────────────────────
-- professional-signatures (signature pad output)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/svg+xml','image/png']::text[],
       file_size_limit    = 1048576   -- 1 MiB
 WHERE name = 'professional-signatures';

-- ─────────────────────────────────────────────────────────────────────────────
-- project-files (project attachments; allow common office types too)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'application/pdf',
         'image/jpeg','image/png','image/webp',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       ]::text[],
       file_size_limit    = 15728640  -- 15 MiB
 WHERE name = 'project-files';

-- ─────────────────────────────────────────────────────────────────────────────
-- quotes (quote PDFs)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['application/pdf']::text[],
       file_size_limit    = 10485760  -- 10 MiB
 WHERE name = 'quotes';

-- ─────────────────────────────────────────────────────────────────────────────
-- Self-check: every private bucket MUST now have an allow-list or remain
-- untouched because its allow-list was already set. Public buckets are exempt.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_open_private text;
BEGIN
  SELECT string_agg(name, ', ' ORDER BY name)
    INTO v_open_private
    FROM storage.buckets
   WHERE public = false
     AND (allowed_mime_types IS NULL OR array_length(allowed_mime_types, 1) IS NULL);

  IF v_open_private IS NOT NULL THEN
    RAISE WARNING
      'storage_mime_types_v0_41: private buckets still without MIME allow-list: % '
      '(intentional if no longer used; otherwise add a row above)', v_open_private;
  ELSE
    RAISE NOTICE 'OK: every private bucket has an explicit allowed_mime_types list';
  END IF;
END $$;

COMMIT;