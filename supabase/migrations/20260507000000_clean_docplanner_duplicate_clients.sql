-- ============================================================
-- Mark DocPlanner pending clients as inactive + prevent future duplicates
--
-- ROOT CAUSE: When DocPlanner sends a patient WITHOUT a real numeric
-- patient ID (only name+surname as synthetic ID like "arantxa|duplicado")
-- and WITHOUT phone/email, Step 4 created an ACTIVE client. Then when
-- the same patient comes back with different synthetic ID + phone/email,
-- a NEW active client was created → duplication.
--
-- This migration:
-- 1. Marks ALL active docplanner clients with no phone AND no email
--    as inactive pending (they appear in Doctoralia tab for manual review)
-- 2. Adds partial unique index to prevent future active duplicates by
--    (company_id, docplanner_patient_id)
--
-- The Edge Function logic (v35+):
-- - If patient has phone OR email: normal deduplication + active client
-- - If patient has NO phone AND NO email:
--   a. Look for existing INACTIVE pending with same name+surname
--   b. If found → reuse it (update docplanner_patient_id)
--   c. If not found → create new inactive pending
-- ============================================================

BEGIN;

-- ── 1. Mark pending inactive ────────────────────────────
UPDATE public.clients
SET
  is_active  = false,
  metadata   = jsonb_set(
    COALESCE(metadata, '{}'),
    '{pending_docplanner_import}',
    'true',
    true
  ),
  updated_at = NOW()
WHERE docplanner_patient_id IS NOT NULL
  AND phone IS NULL
  AND email IS NULL
  AND is_active = true;

-- ── 2. Partial unique index ──────────────────────────────
-- Prevents future active duplicates: each (company_id, docplanner_patient_id)
-- can only have ONE active client. Pending inactive clients are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS clients_docplanner_no_dup_active
  ON public.clients (company_id, docplanner_patient_id)
  WHERE is_active = true AND docplanner_patient_id IS NOT NULL;

COMMIT;