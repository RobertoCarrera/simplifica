-- ============================================================================
-- One-shot: mark past-but-unconfirmed sessions as imparted.
-- This fires the trg_session_close_to_invoice trigger, which accepts the
-- linked quote (draft -> accepted) and creates the draft invoice.
--
-- Companion: this is the ONE-SHOT version. The recurring cron (Phase 2
-- of the post-session automation plan, not yet implemented) is what
-- should keep this clean going forward. See Engram memory.
-- ============================================================================

DO $$
DECLARE
  v_n int := 0;
BEGIN
  UPDATE public.bookings
  SET session_confirmed_at = COALESCE(session_confirmed_at, now()),
      updated_at = now()
  WHERE start_time < now()
    AND session_confirmed_at IS NULL
    AND status NOT IN ('cancelled');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Marked % past sessions as confirmed', v_n;
END $$;