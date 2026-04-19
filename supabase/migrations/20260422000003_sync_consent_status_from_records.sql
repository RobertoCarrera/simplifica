-- Migration: Sync consent_status from gdpr_consent_records + backfill
-- Part of GDPR duplicate cleanup (audit: docs/gdpr-duplicate-audit.md)
--
-- Problem: clients.consent_status is manually set and can drift from actual consent state
-- Solution: derive consent_status from latest gdpr_consent_records entry per client
--
-- Logic:
--   - If any active (not withdrawn) gdpr_consent_records with consent_given=true → 'accepted'
--   - If any gdpr_consent_records with consent_given=false (including withdrawn) → 'revoked'
--   - If only pending records with no explicit accepted/rejected → 'pending'
--   - If no consent records at all → 'pending' (default)

-- ── 1. Backfill consent_status from gdpr_consent_records ─────────────────────────
UPDATE public.clients c
SET
  consent_status = sub.derived_status,
  consent_date = sub.latest_date,
  updated_at = NOW()
FROM (
  SELECT
    c.id AS client_id,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM public.gdpr_consent_records r
        WHERE r.subject_id = c.id
          AND r.consent_given = true
          AND r.withdrawn_at IS NULL
      ) THEN 'accepted'::public.consent_status
      WHEN EXISTS (
        SELECT 1 FROM public.gdpr_consent_records r
        WHERE r.subject_id = c.id
          AND r.consent_given = false
      ) THEN 'revoked'::public.consent_status
      WHEN EXISTS (
        SELECT 1 FROM public.gdpr_consent_records r
        WHERE r.subject_id = c.id
      ) THEN 'pending'::public.consent_status
      ELSE c.consent_status  -- Keep existing if no records at all (NULL/default)
    END AS derived_status,
    (
      SELECT created_at FROM public.gdpr_consent_records
      WHERE subject_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    ) AS latest_date
  FROM public.clients c
) AS sub
WHERE sub.client_id = c.id
  AND sub.derived_status IS NOT NULL;

-- ── 2. Create RPC to sync a single client's consent_status ──────────────────────
CREATE OR REPLACE FUNCTION public.sync_client_consent_status(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clients
  SET
    consent_status = sub.derived_status,
    consent_date = sub.latest_date,
    updated_at = NOW()
  FROM (
    SELECT
      p_client_id AS client_id,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.gdpr_consent_records r
          WHERE r.subject_id = p_client_id
            AND r.consent_given = true
            AND r.withdrawn_at IS NULL
        ) THEN 'accepted'::public.consent_status
        WHEN EXISTS (
          SELECT 1 FROM public.gdpr_consent_records r
          WHERE r.subject_id = p_client_id
            AND r.consent_given = false
        ) THEN 'revoked'::public.consent_status
        WHEN EXISTS (
          SELECT 1 FROM public.gdpr_consent_records r
          WHERE r.subject_id = p_client_id
        ) THEN 'pending'::public.consent_status
        ELSE 'pending'::public.consent_status
      END AS derived_status,
      (
        SELECT created_at FROM public.gdpr_consent_records
        WHERE subject_id = p_client_id
        ORDER BY created_at DESC
        LIMIT 1
      ) AS latest_date
  ) AS sub
  WHERE clients.id = p_client_id;
END;
$$;

COMMENT ON FUNCTION public.sync_client_consent_status(uuid) IS
'Derives and updates clients.consent_status from gdpr_consent_records. Called by trigger or manually after bulk consent changes.';

-- ── 3. Index on consent_status for GDPR dashboard queries ───────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_consent_status_company
  ON public.clients(company_id, consent_status)
  WHERE consent_status IS NOT NULL;

-- ── 4. Mark data_processing_consent as deprecated ───────────────────────────────
COMMENT ON COLUMN clients.data_processing_consent IS
  'Deprecated 2026-04: Use gdpr_consent_records type=data_processing as canonical source. This column is retained for read compatibility but should not be written directly. Will be removed in a future migration.';

COMMENT ON COLUMN clients.data_processing_consent_date IS
  'Deprecated 2026-04: Use gdpr_consent_records created_at for timestamp. Retained for read compatibility only.';

-- ── 5. Log the migration in audit log (if table exists) ────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'gdpr_audit_log'
  ) THEN
    INSERT INTO public.gdpr_audit_log (action_type, table_name, record_id, purpose, new_values, created_at)
    VALUES (
      'migration',
      'clients',
      NULL,
      'GDPR consent_status sync migration 20260422000003',
      jsonb_build_object('description', 'Backfilled consent_status from gdpr_consent_records; added sync_client_consent_status RPC'),
      NOW()
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not log migration in gdpr_audit_log: %', SQLERRM;
END $$;