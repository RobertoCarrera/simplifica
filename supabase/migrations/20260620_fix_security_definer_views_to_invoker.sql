-- Migration: fix_security_definer_views_to_invoker
-- Sprint: Rafter v0.12 (post-v0.11 audit followups)
-- Author: Roberto + AI
-- Date: 2026-06-20
--
-- STATUS: APPLIED 2026-06-20
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- Rafter Supabase linter reported 3 SECURITY DEFINER views at ERROR level:
--   - public.client_visible_quotes
--   - public.v_booking_reconciliation
--   - public.v_reconciliation_summary
--
-- SECURITY DEFINER views run with the privileges of the view OWNER (typically
-- postgres), bypassing row-level security on the underlying tables. This means
-- an authenticated user querying the view could see rows from companies they
-- don't belong to, if the underlying tables had RLS that the view bypassed.
--
-- This migration fixes the 2 reconciliation views by switching them to
-- SECURITY INVOKER (the default in Postgres 15+). With security_invoker = true,
-- the view runs with the privileges of the QUERYING USER, so RLS on bookings,
-- quotes, and invoices is properly enforced.
--
-- The client_visible_quotes view is INTENTIONALLY SECURITY DEFINER because it
-- invokes client_get_visible_quotes() which is also SECURITY DEFINER (the RPC
-- does the filtering internally). Leaving it as-is.
--
-- ────────────────────────────────────────────────────────────────────────────
-- SAFETY VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────
--
-- After applying, the underlying tables (bookings, quotes, invoices) have
-- these RLS policies:
--
-- bookings_select: company_members of role supervisor/owner/admin/super_admin,
--                 OR professional with assignment to the booking's client
-- quotes_select_policy: company_members OR client (via client_id) OR
--                       professional via client_assignments
-- invoices_select_policy: company_members, created_by user, client (via
--                         client_id), or professional via assignments
--
-- All SELECT policies filter by company_id or client_id via company_members
-- JOIN. The view's `eq('company_id', X)` filter in the frontend is now
-- redundant but harmless (RLS is the authoritative filter).
--
-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION STATEMENTS
-- ────────────────────────────────────────────────────────────────────────────

-- v_booking_reconciliation: recreate with security_invoker
CREATE OR REPLACE VIEW public.v_booking_reconciliation
WITH (security_invoker = true) AS
SELECT b.id AS booking_id,
       b.company_id,
       b.client_id,
       b.customer_name,
       b.start_time,
       b.status AS booking_status,
       b.payment_status AS booking_payment_status,
       (b.session_confirmed_at IS NOT NULL) AS session_confirmed,
       (b.quote_id IS NOT NULL) AS has_quote,
       q.status AS quote_status,
       q.total_amount AS quote_total,
       CASE
         WHEN (b.quote_id IS NULL) THEN 'missing_quote'::text
         WHEN (q.status = 'draft'::quote_status) THEN 'quote_draft'::text
         ELSE 'ok'::text
       END AS reconciliation_status
FROM (bookings b LEFT JOIN quotes q ON ((q.id = b.quote_id)));

-- v_reconciliation_summary: recreate with security_invoker
CREATE OR REPLACE VIEW public.v_reconciliation_summary
WITH (security_invoker = true) AS
SELECT b.company_id,
       count(*) AS total_bookings,
       count(*) FILTER (WHERE (b.quote_id IS NULL)) AS bookings_without_quote,
       count(*) FILTER (WHERE (b.quote_id IS NOT NULL)) AS bookings_with_quote,
       count(*) FILTER (WHERE (q.status = 'draft'::quote_status)) AS quotes_draft,
       count(*) FILTER (WHERE (q.status = 'accepted'::quote_status)) AS quotes_accepted,
       count(*) FILTER (WHERE (q.status = 'rejected'::quote_status)) AS quotes_rejected,
       count(*) FILTER (WHERE ((b.invoice_id IS NULL) AND ((b.start_time < now()) OR (b.session_confirmed_at IS NOT NULL)) AND (b.client_id IS NOT NULL))) AS sessions_without_invoice,
       count(*) FILTER (WHERE (i.status = 'draft'::invoice_status)) AS invoices_draft,
       count(*) FILTER (WHERE (i.status = ANY (ARRAY['issued'::invoice_status, 'sent'::invoice_status]))) AS invoices_issued,
       count(*) FILTER (WHERE (i.payment_status = 'paid'::text)) AS invoices_paid,
       COALESCE(sum(i.total) FILTER (WHERE (i.payment_status = 'paid'::text)), (0)::numeric) AS paid_amount_total
FROM ((bookings b LEFT JOIN quotes q ON ((q.id = b.quote_id)))
      LEFT JOIN invoices i ON ((i.id = b.invoice_id)))
GROUP BY b.company_id;

-- ────────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────
--
-- Run after applying:
--
-- 1. Check Supabase linter for security_definer_view:
--    Expected: 1 remaining (client_visible_quotes, intentional)
--
-- 2. Check view still works for service_role:
--    SET ROLE service_role;
--    SELECT count(*) FROM public.v_booking_reconciliation;
--    SELECT count(*) FROM public.v_reconciliation_summary;
--    RESET ROLE;
--    Expected: returns counts (not error)
--
-- 3. Check RLS still applies for authenticated:
--    SET ROLE authenticated;
--    SELECT count(*) FROM public.v_reconciliation_summary
--      WHERE company_id = 'other-company-uuid-here';
--    RESET ROLE;
--    Expected: returns 0 (RLS filters out other companies)
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Recreate the views WITHOUT the WITH (security_invoker = true) clause.
-- Original definitions are in supabase/migrations/20260615000000_auto_quote_on_booking_lifecycle.sql
--
-- ⚠️  WARNING: rolling back re-introduces the SECURITY DEFINER vulnerability
-- (RLS bypass). Only roll back if the new views are blocking legitimate
-- access that the old views allowed.