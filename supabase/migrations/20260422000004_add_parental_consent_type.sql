-- Migration: Add parental_consent to consent_type enum
-- Part of GDPR duplicate cleanup (audit: docs/gdpr-duplicate-audit.md)
--
-- Problem: parental_consent is stored only on clients table (parental_consent_verified, parental_consent_date)
--          with no corresponding record in gdpr_consent_records. This breaks Art.8 compliance
--          for children's data because there's no immutable audit trail.
--
-- Solution:
--   1. Add 'parental_consent' to consent_type enum
--   2. Add migration for existing clients: create parental_consent records from client columns
--   3. Document that future parental consent changes must go through gdprService.recordConsent()

-- ── 1. Check if parental_consent type already exists in enum ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum en
    JOIN pg_type typ ON typ.oid = en.enumtypid
    WHERE typ.typname = 'consent_type'
    AND en.enumlabel = 'parental_consent'
  ) THEN
    ALTER TYPE public.consent_type ADD VALUE IF NOT EXISTS 'parental_consent';
  END IF;
END $$;

COMMENT ON TYPE public.consent_type IS
'Types of GDPR consent. Added parental_consent 2026-04 for Art.8 children's data compliance.';

-- ── 2. Create migration records for existing clients with parental consent ────────
-- For each client where parental_consent_verified = true, create a gdpr_consent_records entry
INSERT INTO public.gdpr_consent_records (
  subject_id,
  subject_email,
  consent_type,
  purpose,
  consent_given,
  consent_method,
  legal_basis,
  created_at
)
SELECT
  c.id AS subject_id,
  c.email AS subject_email,
  'parental_consent'::public.consent_type AS consent_type,
  'Consent for processing child data under GDPR Art.8' AS purpose,
  c.parental_consent_verified AS consent_given,
  'physical_document' AS consent_method,  -- Assume physical doc for legacy entries
  'GDPR Article 8 - parental consent for child data processing' AS legal_basis,
  COALESCE(c.parental_consent_date, c.created_at) AS created_at
FROM public.clients c
WHERE c.parental_consent_verified = true
  AND c.email IS NOT NULL
  AND NOT EXISTS (
    -- Don't duplicate if already a parental_consent record exists
    SELECT 1 FROM public.gdpr_consent_records r
    WHERE r.subject_id = c.id
      AND r.consent_type = 'parental_consent'
  )
ON CONFLICT DO NOTHING;  -- Handle gracefully if constraint prevents duplicate

-- ── 3. Add index for parental consent queries ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gdpr_consent_parental
  ON public.gdpr_consent_records(company_id, consent_type, subject_id)
  WHERE consent_type = 'parental_consent';

-- ── 4. Add index to clients for is_minor + parental check ───────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_minor_parental
  ON public.clients(company_id, is_minor, parental_consent_verified)
  WHERE is_minor = true;

-- ── 5. Document the constraint that health_data consent requires parental for minors
COMMENT ON COLUMN clients.is_minor IS
  'Indicates client is under 16 (Spain: 14 for digital services). If true, health_data_consent requires parental_consent_verified=true.';
COMMENT ON COLUMN clients.parental_consent_verified IS
  'Parental consent verified for child data processing. GDPR Art.8 requires this before processing data of minors.';