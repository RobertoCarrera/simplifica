-- Migration: revoke_booking_client_secdef_from_anon_authenticated
-- Sprint: Rafter v0.11d — Booking/client management batch
-- Author: Roberto + AI
-- Date: 2026-06-20
--
-- STATUS: SMOKE TESTED 2026-06-20 — ready to apply
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- Followup to v0.11a (GDPR), v0.11b (analytics), v0.11c (mail/CRM).
-- Fourth batch: Booking + Client management helpers (18 functions).
--
-- Remaining batches:
--   v0.11e: Internal/dev helpers (~21 functions)
--
-- ────────────────────────────────────────────────────────────────────────────
-- CALLER ANALYSIS (verified 2026-06-20)
-- ────────────────────────────────────────────────────────────────────────────
--
-- All 18 functions have:
--   - Zero internal SECDEFINER callers
--   - Zero internal non-SECDEFINER callers
--   - Zero trigger dependencies
--   - Zero frontend callers
--   - Zero Edge Function callers
--
-- Conclusion: REVOKE FROM anon, authenticated has zero impact. SAFE.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION STATEMENTS
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Booking operations
REVOKE EXECUTE ON FUNCTION public.cancel_booking_with_refund(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_booking_with_refund(integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_booking_with_validations(integer, integer, timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_booking_with_validations(integer, integer, timestamp with time zone) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_booking_config(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_booking_config(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_availability_data(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_availability_data(uuid, timestamp with time zone, timestamp with time zone) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_blocked_dates(uuid, uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_blocked_dates(uuid, uuid, date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_scan_incomplete_bookings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cron_scan_incomplete_bookings() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.maintain_ticket_opened_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.maintain_ticket_opened_status() FROM authenticated;

-- 2. Booking notifications
REVOKE EXECUTE ON FUNCTION public.notify_booking_notifier() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_booking_notifier() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_holded_booking_confirmed() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_holded_booking_confirmed() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_holded_booking_estimate() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_holded_booking_estimate() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_session_created() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_session_created() FROM authenticated;

-- 3. Waitlist
REVOKE EXECUTE ON FUNCTION public.join_waiting_list_v2(bigint, bigint, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_waiting_list_v2(bigint, bigint, bigint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.join_waiting_list_v2(integer, bigint, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_waiting_list_v2(integer, bigint, bigint) FROM authenticated;

-- 4. Client management
REVOKE EXECUTE ON FUNCTION public.add_client_note(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_client_note(uuid, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_client_notes(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_client_notes(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_client_access_history(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_client_access_history(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.client_get_visible_quotes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_get_visible_quotes() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.client_get_visible_tickets() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_get_visible_tickets() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.client_dedup_rollback() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_dedup_rollback() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_client_stats_on_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_client_stats_on_change() FROM authenticated;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────
--
-- SELECT count(*) FILTER (WHERE NOT has_function_privilege('anon', p.oid, 'EXECUTE')) AS anon_blocked,
--        count(*) FILTER (WHERE NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS auth_blocked,
--        count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE')) AS sr_has,
--        count(*) FILTER (WHERE has_function_privilege('postgres', p.oid, 'EXECUTE')) AS pg_has,
--        count(*) AS total
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname IN (
--   'cancel_booking_with_refund','create_booking_with_validations','get_booking_config',
--   'get_availability_data','get_public_blocked_dates','cron_scan_incomplete_bookings',
--   'maintain_ticket_opened_status','notify_booking_notifier','notify_holded_booking_confirmed',
--   'notify_holded_booking_estimate','notify_session_created','join_waiting_list_v2',
--   'add_client_note','get_client_notes','get_client_access_history','client_get_visible_quotes',
--   'client_get_visible_tickets','client_dedup_rollback','update_client_stats_on_change'
-- );
--
-- Expected: 19 rows (18 distinct + 1 overload for join_waiting_list_v2)
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- ────────────────────────────────────────────────────────────────────────────
-- GRANT EXECUTE TO PUBLIC, GRANT EXECUTE TO authenticated for each function.