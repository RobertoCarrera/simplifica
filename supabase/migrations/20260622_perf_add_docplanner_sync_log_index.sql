-- =============================================================================
-- Perf: Add (company_id, started_at DESC) index on docplanner_sync_log
-- =============================================================================
-- Source: Rafter v0.35 DB perf audit (docs/rafter-v35-db-perf.md, F-03)
--
-- Query optimized:
--   SELECT ... FROM docplanner_sync_log
--   WHERE company_id = $1 ORDER BY started_at DESC LIMIT $2
--
-- Before: seq scan → 229 disk blocks / call (97.86% miss, cold cache)
-- After:  index scan → ~5 blocks / call
--
-- Existing indexes on this table: (company_id), (created_at DESC), id.
-- None covered (company_id, started_at DESC), so the planner fell back to seq.
--
-- Run outside a transaction (CONCURRENTLY is required for non-blocking creation).
-- Applied via: SELECT  CREATE INDEX CONCURRENTLY IF NOT EXISTS ...
-- If a previous CONCURRENTLY attempt failed, drop the INVALID index manually:
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_docplanner_sync_log_company_started;
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_docplanner_sync_log_company_started
  ON public.docplanner_sync_log (company_id, started_at DESC);