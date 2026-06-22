-- =============================================================================
-- Perf: Add (reference_id, type) partial index on notifications
-- =============================================================================
-- Source: Rafter v0.35 DB perf audit (docs/rafter-v35-db-perf.md, F-02)
--
-- Query optimized:
--   SELECT ... FROM notifications
--   WHERE reference_id = $1 AND type = $2 LIMIT $3 OFFSET $4
--
-- Before: seq scan on a 49 MB table → 1,853 disk blocks / call (49.95% miss)
-- After:  index-only scan → ~10 blocks / call (~180x IO reduction)
--
-- Run outside a transaction (CONCURRENTLY is required for non-blocking creation).
-- Applied via: SELECT  CREATE INDEX CONCURRENTLY IF NOT EXISTS ...
-- If a previous CONCURRENTLY attempt failed, drop the INVALID index manually:
--   DROP INDEX CONCURRENTLY IF EXISTS public.idx_notifications_reference_type;
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_reference_type
  ON public.notifications (reference_id, type)
  WHERE reference_id IS NOT NULL;