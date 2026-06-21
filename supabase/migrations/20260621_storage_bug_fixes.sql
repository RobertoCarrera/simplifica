-- Migration: storage_bug_fixes
-- Sprint: Rafter v0.16 (storage bug fixes — PRODUCTION CRITICAL)
-- Date: 2026-06-21
--
-- Fixes 3 production bugs from Rafter storage re-scan:
--   1. Recreate missing 'payment-receipts' bucket + policies
--   2. Add missing SELECT policy on 'attachments' bucket
--   3. Drop empty orphan buckets 'hr-documents' and 'mail-attachments'
--
-- Re-scan: C:/Users/puchu/AppData/Local/Temp/rafter-rescan-storage-2026-06-21-summary.md
--
-- Pre-conditions (verified 2026-06-21):
--   - payment-receipts absent from storage.buckets (0 rows)
--   - hr-documents: 0 objects, 0 callers → safe to drop
--   - mail-attachments: 0 objects, 0 callers → safe to drop
--   - attachments: has DELETE/UPDATE/INSERT policies but NO SELECT → createSignedUrl fails
--
-- Out of scope (separate sub-tasks):
--   - ticket-attachments PII exposure (requires FE fix first)
--   - device-images, professional-avatars unscoped INSERT
--   - marketing-campaign-images (1 object, needs manual review)
--   - invoices, quotes zero-policies defense-in-depth

--------------------------------------------------------------------------------
-- 1. Recreate 'payment-receipts' bucket + 2 SELECT policies
--    Source: migration 20260609000004_budget_payment_flow.sql lines 510-547
--    The bucket was created by the migration then deleted out-of-band.
--    schema_migrations still records the migration as applied (migrations table
--    is updated even if a later statement is a no-op due to ON CONFLICT).
--------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Company members can read budget payment receipts" ON storage.objects;
CREATE POLICY "Company members can read budget payment receipts"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND EXISTS (
      SELECT 1
      FROM public.recurring_budgets rb
      JOIN company_members cm ON cm.company_id = rb.company_id
      JOIN users u ON u.id = cm.user_id
      WHERE rb.receipt_pdf_path = storage.objects.name
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Clients can read their own budget payment receipts" ON storage.objects;
CREATE POLICY "Clients can read their own budget payment receipts"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND EXISTS (
      SELECT 1
      FROM public.recurring_budgets rb
      JOIN users u ON u.client_id = rb.client_id
      WHERE rb.receipt_pdf_path = storage.objects.name
        AND u.auth_user_id = auth.uid()
    )
  );

--------------------------------------------------------------------------------
-- 2. Add SELECT policy for 'attachments' bucket
--    Pattern: owner-scoped (matches booking-documents tighten from 20260413000005).
--    Path layout: tickets/{ticket_id}/comments/{timestamp}_{uuid}.{ext}
--    Bucket was missing SELECT → createSignedUrl() in ticket-detail.component.ts
--    failed silently since 2025-12-20 (2 existing objects unreachable).
--    The check name ~~ 'tickets/%/comments/%' gates the EXISTS lookup to ticket
--    comment paths only; the EXISTS further filters to active company members of
--    the ticket's company.
--------------------------------------------------------------------------------
DROP POLICY IF EXISTS "attachments_select_tickets_comments" ON storage.objects;
CREATE POLICY "attachments_select_tickets_comments"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND name LIKE 'tickets/%/comments/%'
    AND EXISTS (
      SELECT 1
      FROM tickets t
      JOIN company_members cm ON cm.company_id = t.company_id
      JOIN users u ON u.id = cm.user_id
      WHERE t.id::text = (string_to_array(name, '/'))[2]
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

--------------------------------------------------------------------------------
-- 3. Drop empty orphan buckets 'hr-documents' and 'mail-attachments'
--    Verified: 0 objects in both, 0 callers in FE/EF/migrations.
--    Drop the policies first to avoid dangling policy rows after bucket removal.
--------------------------------------------------------------------------------

-- 3a. hr-documents: 1 policy (hr_docs_employee_view)
DROP POLICY IF EXISTS "hr_docs_employee_view" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'hr-documents';

-- 3b. mail-attachments: 4 policies (Auth Upload, Users_insert/select/delete_mail_attachments)
DROP POLICY IF EXISTS "Auth Upload" ON storage.objects;
DROP POLICY IF EXISTS "Users_insert_mail_attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users_select_mail_attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users_delete_mail_attachments" ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'mail-attachments';
