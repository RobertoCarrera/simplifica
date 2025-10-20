-- =============================================================
-- Smoke tests: Stage coverage + safe delete validation
-- Usage:
--   1) Open Supabase SQL editor (or psql) against your project
--   2) Replace the placeholders below with real UUIDs from your data
--   3) Run sections independently; transactions ROLLBACK by default
--
-- This file does NOT modify persistent data unless you remove ROLLBACK.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 0) PARAMETERS: Set your company and stage IDs here
-- ─────────────────────────────────────────────────────────────
-- Hints to pick IDs:
--   - company_id: your active company
--   - stage_to_delete: a company-specific stage (company_id = company)
--   - reassign_to   : another company-specific stage in same category
--
-- SELECT id, name, workflow_category, company_id FROM ticket_stages ORDER BY company_id NULLS LAST, workflow_category;

\set company_id        '00000000-0000-0000-0000-000000000000'
\set stage_to_delete   '00000000-0000-0000-0000-000000000001'
\set reassign_to       '00000000-0000-0000-0000-000000000002'

-- ─────────────────────────────────────────────────────────────
-- 1) Visibility check per category (company + generic-not-hidden)
-- ─────────────────────────────────────────────────────────────
WITH visible AS (
  SELECT s.id, s.name, s.workflow_category::text AS cat
  FROM ticket_stages s
  WHERE s.deleted_at IS NULL
    AND (
      s.company_id = :company_id::uuid OR (
        s.company_id IS NULL AND NOT EXISTS (
          SELECT 1 FROM hidden_stages h
          WHERE h.company_id = :company_id::uuid AND h.stage_id = s.id
        )
      )
    )
)
SELECT cat, COUNT(*) AS visible_count
FROM visible
GROUP BY cat
ORDER BY cat;

-- Expectation: each required category [waiting, analysis, action, final, cancel]
-- should have at least 1 visible stage for this company.

-- ─────────────────────────────────────────────────────────────
-- 2) Safe delete without reassignment when tickets reference the stage
--    Should error with REASSIGN_REQUIRED at Edge Function level, but here
--    we exercise the underlying RPC to see the backend message.
-- ─────────────────────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  res jsonb;
BEGIN
  RAISE NOTICE 'Attempting delete without reassignment (expect failure if tickets reference it)';
  res := public.safe_delete_ticket_stage(:stage_to_delete::uuid, :company_id::uuid, NULL);
  RAISE NOTICE 'Result: %', res;
END$$;
ROLLBACK;  -- Do not persist changes during smoke test

-- If there are tickets referencing the stage, the function raises an exception
-- like: 'Stage <id> is referenced by <n> tickets. Provide p_reassign_to ...'

-- ─────────────────────────────────────────────────────────────
-- 3) Safe delete WITH reassignment (same category, same company)
--    Should succeed and report number of reassigned tickets
-- ─────────────────────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  res jsonb;
BEGIN
  RAISE NOTICE 'Attempting delete WITH reassignment to %', :'reassign_to';
  res := public.safe_delete_ticket_stage(:stage_to_delete::uuid, :company_id::uuid, :reassign_to::uuid);
  RAISE NOTICE 'Result: %', res;
  RAISE NOTICE 'Reversing changes (rollback)';
END$$;
ROLLBACK;  -- Remove to persist

-- If you see an error mentioning coverage, ensure there is at least one
-- visible stage in that category for the company, or unhide a system stage.

-- ─────────────────────────────────────────────────────────────
-- 4) Coverage guard: simulate last-visible-in-category deletion
--    Expect exception about category coverage if no other visible stage exists
-- ─────────────────────────────────────────────────────────────
BEGIN;
DO $$
DECLARE
  res jsonb;
BEGIN
  -- Ensure pre-condition: count visible stages of the target category excluding the stage to delete
  PERFORM 1;
  RAISE NOTICE 'If this is the last visible stage in its category, the next call should fail with coverage error';
  res := public.safe_delete_ticket_stage(:stage_to_delete::uuid, :company_id::uuid, NULL);
  RAISE NOTICE 'Result: %', res;
END$$;
ROLLBACK;

-- Notes:
--  - The Edge Function adds CORS/auth and maps backend errors to codes:
--      COVERAGE_BREAK (409), REASSIGN_REQUIRED (409), SYNTAX_ERROR (400), FUNCTION_MISSING (500)
--  - This SQL runs the RPC directly (no CORS/auth), useful to see raw messages
