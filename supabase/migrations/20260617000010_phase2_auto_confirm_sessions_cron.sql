-- ============================================================================
-- Phase 2 automation: auto-confirm past sessions via pg_cron
-- ============================================================================
-- Companion to check-completed-sessions cron (which is Phase 1: notifications).
--
-- This Phase 2 cron:
-- - Finds bookings where start_time < now(), session_confirmed_at IS NULL,
--   status NOT IN ('cancelled')
-- - Sets session_confirmed_at = now() — which fires trg_session_close_to_invoice
--   which accepts the linked quote (draft -> accepted) and creates a draft invoice
--
-- This prevents the recurring problem where quotes stay in 'draft' forever
-- because their bookings crossed start_time without anyone updating them.
-- Manifested in this session with 5 quotes that had to be manually fixed.
--
-- Frequency: every 30 minutes (balances freshness vs. noise).
--
-- Idempotent: re-running the SQL is safe (no-op for already-confirmed bookings).
--
-- To remove this cron manually:
--   SELECT cron.unschedule('auto-confirm-sessions');
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove old version if it exists (idempotent re-deploy)
SELECT cron.unschedule('auto-confirm-sessions')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-confirm-sessions'
);

-- Schedule every 30 minutes
SELECT cron.schedule(
  'auto-confirm-sessions',
  '*/30 * * * *',
  $cmd$
    UPDATE public.bookings
    SET session_confirmed_at = COALESCE(session_confirmed_at, now()),
        updated_at = now()
    WHERE start_time < now()
      AND session_confirmed_at IS NULL
      AND status NOT IN ('cancelled');
  $cmd$
);