-- Migration: Add privacy_policy_consent to clients table
-- Part of GDPR duplicate cleanup (audit: docs/gdpr-duplicate-audit.md)
--
-- Adds: clients.privacy_policy_consent (boolean)
-- Adds: clients.privacy_policy_consent_date (timestamp)
--
-- Backfills: privacy_policy_consent=true where a 'privacy_policy' gdpr_consent_records entry exists with consent_given=true
-- Backfills: privacy_policy_consent_date from most recent 'privacy_policy' record's created_at

-- ── 1. Add columns ─────────────────────────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS privacy_policy_consent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS privacy_policy_consent_date timestamptz;

COMMENT ON COLUMN clients.privacy_policy_consent IS 'GDPR Art.7 consent for privacy policy acceptance — canonical source: gdpr_consent_records type=privacy_policy';
COMMENT ON COLUMN clients.privacy_policy_consent_date IS 'Timestamp of privacy policy consent grant/revocation';

-- ── 2. Backfill existing privacy policy consents ─────────────────────────────────
UPDATE public.clients c
SET
  privacy_policy_consent = true,
  privacy_policy_consent_date = latest.created_at
FROM (
  SELECT DISTINCT ON (subject_id)
    subject_id,
    created_at
  FROM public.gdpr_consent_records
  WHERE consent_type = 'privacy_policy'
    AND consent_given = true
  ORDER BY subject_id, created_at DESC
) AS latest
WHERE latest.subject_id = c.id
  AND c.privacy_policy_consent IS DISTINCT FROM true;

-- ── 3. Add RLS for new columns ───────────────────────────────────────────────────
-- Read: company members can read their clients' privacy consent
CREATE OR REPLACE POLICY "clients_privacy_consent_read"
  ON public.clients
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- Write: only via system (trigger/RPC) or super_admin
-- Components should NOT write directly — use gdpr_consent_records + trigger
CREATE OR REPLACE POLICY "clients_privacy_consent_update_system_only"
  ON public.clients
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT auth_user_id FROM public.users WHERE role = 'super_admin'
    )
    -- NOTE: Direct application writes should be removed per audit recommendations.
    -- The trigger will handle updates coming from gdpr_consent_records.
  );

-- ── 4. Add index for consent queries ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_privacy_consent_company
  ON public.clients(company_id, privacy_policy_consent)
  WHERE privacy_policy_consent IS NOT NULL;

-- ── 5. Comment deprecating data_processing_consent in clients ───────────────────
COMMENT ON COLUMN clients.data_processing_consent IS
  'Deprecated 2026-04: Use gdpr_consent_records type=data_processing as canonical source. This column is retained for read compatibility but should not be written directly.';

-- ── 6. Helper function to sync privacy_policy_consent from gdpr_consent_records ──
-- This can be called manually or via trigger. Idempotent.
CREATE OR REPLACE FUNCTION public.sync_client_privacy_consent(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clients
  SET
    privacy_policy_consent = sub.latest_given,
    privacy_policy_consent_date = sub.latest_date,
    updated_at = NOW()
  FROM (
    SELECT
      subject_id,
      MAX(consent_given) FILTER (WHERE consent_type = 'privacy_policy') AS latest_given,
      MAX(created_at) FILTER (WHERE consent_type = 'privacy_policy' AND consent_given = true) AS latest_date
    FROM public.gdpr_consent_records
    WHERE subject_id = p_client_id
    GROUP BY subject_id
  ) AS sub
  WHERE clients.id = p_client_id;
END;
$$;

COMMENT ON FUNCTION public.sync_client_privacy_consent(uuid) IS
'Syncs clients.privacy_policy_consent from the latest gdpr_consent_records privacy_policy entry. Idempotent — safe to call after any consent change.';