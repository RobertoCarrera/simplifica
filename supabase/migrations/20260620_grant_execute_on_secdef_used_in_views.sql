-- Migration: grant_execute_on_secdef_used_in_views
-- Sprint: Rafter v0.11 POST-FIX
-- Author: Roberto + AI
-- Date: 2026-06-20
--
-- STATUS: APPLIED 2026-06-20
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- Post-mortem fix for Rafter v0.11d. The v0.11 analysis missed that
-- client_get_visible_quotes and client_get_visible_tickets are referenced
-- in the definition of views `client_visible_quotes` and
-- `client_visible_tickets` respectively. Revoking EXECUTE on these
-- functions broke the views (SELECT * FROM client_visible_quotes failed
-- with permission denied).
--
-- This migration restores EXECUTE for the 2 functions used in view
-- definitions. The views are used by:
-- - src/app/features/bookings/services (visible quotes per client)
-- - src/app/features/tickets/services (visible tickets per client)
--
-- ────────────────────────────────────────────────────────────────────────────
-- FUNCTIONS RESTORED
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

GRANT EXECUTE ON FUNCTION public.client_get_visible_quotes() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_get_visible_quotes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_get_visible_quotes() TO anon;

GRANT EXECUTE ON FUNCTION public.client_get_visible_tickets() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_get_visible_tickets() TO authenticated;
GRANT EXECUTE ON FUNCTION public.client_get_visible_tickets() TO anon;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────
--
-- SELECT * FROM public.client_visible_quotes LIMIT 1;
-- SELECT * FROM public.client_visible_tickets LIMIT 1;
--
-- Both should return data without permission denied errors.
--
-- ────────────────────────────────────────────────────────────────────────────
-- LESSON LEARNED
-- ────────────────────────────────────────────────────────────────────────────
--
-- Future REVOKE analysis MUST include checks against:
-- 1. pg_policies (qual, with_check)
-- 2. pg_views / pg_matviews (definition)
-- 3. pg_trigger (tgfoid)
-- 4. pg_constraint (consrc via pg_get_constraintdef)
-- 5. pg_attrdef (defaults)
--
-- Query template for future audits:
--
-- WITH target_funcs AS (
--   SELECT proname FROM pg_proc WHERE proname IN (... list ...)
-- )
-- SELECT t.proname, ref_type, ref_name FROM target_funcs t
-- LEFT JOIN pg_policies p ON p.qual ILIKE '%' || t.proname || '%'
-- LEFT JOIN pg_views v ON v.definition ILIKE '%' || t.proname || '%'
-- LEFT JOIN pg_trigger tr ON tr.tgfoid = (SELECT oid FROM pg_proc WHERE proname = t.proname)
-- WHERE ...
--
-- Apply this query BEFORE every REVOKE migration.