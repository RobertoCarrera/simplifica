-- ============================================================
-- DocPlanner: Allow professional import & tagging
-- 2026-04-06
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Allow professionals without a user account (external imports)
--    PostgreSQL UNIQUE allows multiple NULLs, so existing constraint
--    UNIQUE(user_id, company_id) still works fine.
ALTER TABLE public.professionals
  ALTER COLUMN user_id DROP NOT NULL;

-- Drop check constraint that requires user_id or email (imported professionals have neither)
ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_user_or_email_check;

-- 2. Track DocPlanner doctor ID on professionals for deduplication
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS docplanner_doctor_id text;

CREATE INDEX IF NOT EXISTS idx_professionals_docplanner_doctor_id
  ON public.professionals(docplanner_doctor_id)
  WHERE docplanner_doctor_id IS NOT NULL;

COMMENT ON COLUMN public.professionals.docplanner_doctor_id IS
  'DocPlanner doctor ID for professionals imported from Doctoralia. Null = not a DocPlanner professional.';
