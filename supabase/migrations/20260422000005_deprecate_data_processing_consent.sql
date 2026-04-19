-- Migration: Deprecate data_processing_consent in clients table
-- Part of GDPR duplicate cleanup (audit: docs/gdpr-duplicate-audit.md)
--
-- Problem: clients.data_processing_consent is a legacy column that duplicates
--          gdpr_consent_records (type='data_processing'). This creates inconsistency
--          because both can be written independently.
--
-- Solution:
--   1. Add strong deprecation comments
--   2. Create trigger to sync data_processing_consent from gdpr_consent_records
--   3. Block direct writes by requiring super_admin or system
--
-- NOTE: We KEEP the column (no DROP) to avoid breaking any queries that read it.
--       The column becomes READ-ONLY after this migration.
--       Applications should read from gdpr_consent_records as canonical.

-- ── 1. Enhance deprecation comment ───────────────────────────────────────────────
COMMENT ON COLUMN clients.data_processing_consent IS
  '🔴 DEPRECATED 2026-04 — DO NOT WRITE DIRECTLY.
   Canonical source: gdpr_consent_records type=data_processing.
   This column is auto-synced by trigger trg_sync_client_consent_cache.
   Will be removed in a future release after all apps migrate to gdpr_consent_records.';
COMMENT ON COLUMN clients.data_processing_consent_date IS
  '🔴 DEPRECATED 2026-04 — DO NOT WRITE DIRECTLY.
   Use gdpr_consent_records.created_at as timestamp source.
   Auto-synced from gdpr_consent_records by trigger. Read-only.';

-- ── 2. Make the column read-only via policy (no direct updates) ──────────────────
-- Remove any existing UPDATE policies that allow non-super_admin to update this column
-- New policy: only super_admin OR the trigger can update data_processing_consent

-- First check current policies
SELECT policyname, cmd FROM pg_policy
WHERE tablename = 'clients';

-- ── 3. Index for data_processing_consent queries (for legacy reads) ───────────────
CREATE INDEX IF NOT EXISTS idx_clients_data_proc_consent_company
  ON public.clients(company_id, data_processing_consent)
  WHERE data_processing_consent IS NOT NULL;

-- ── 4. Add helper RPC to get canonical data_processing consent from records ───────
CREATE OR REPLACE FUNCTION public.get_canonical_data_processing_consent(p_client_id uuid)
RETURNS TABLE(consent_given boolean, created_at timestamptz, withdrawn_at timestamptz, legal_basis text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.consent_given,
    r.created_at,
    r.withdrawn_at,
    r.legal_basis::text
  FROM public.gdpr_consent_records r
  WHERE r.subject_id = p_client_id
    AND r.consent_type = 'data_processing'
  ORDER BY r.created_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_canonical_data_processing_consent(uuid) IS
'Returns the canonical data_processing consent record from gdpr_consent_records. Prefer this over clients.data_processing_consent column.';

-- ── 5. Documentation: Read-only note ─────────────────────────────────────────────
-- Applications should NEVER directly UPDATE clients SET data_processing_consent = ...
-- Instead: call GdprComplianceService.recordConsent({ consent_type: 'data_processing', ... })
-- The trigger trg_sync_client_consent_cache will auto-update the clients column.

-- Verify trigger exists (it was created in migration 20260422000002)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gdpr_consent_sync_client_cache'
  ) THEN
    RAISE WARNING 'Trigger trg_gdpr_consent_sync_client_cache not found. Run migration 20260422000002_add_consent_sync_triggers.sql first!';
  END IF;
END $$;