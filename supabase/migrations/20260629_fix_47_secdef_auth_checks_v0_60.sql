-- ============================================================================
-- Migration: Rafter v0.60 — REVOKE / ALTER 47 SECURITY DEFINER functions
-- ============================================================================
-- Sprint:   Supabase Security Advisor follow-up batch
-- Audit:    2026-07-02 (Supabase Security Advisor re-scan post v0.57-v0.59)
-- Author:   AI sub-agent (sdd-apply)
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- The 2026-07-02 Supabase Security Advisor re-scan produced 486 WARN
-- findings. 212 of those are of the form
-- `authenticated_security_definer_function_executable`:
-- SECURITY DEFINER functions callable by `authenticated` role with no
-- `auth.uid()` / `is_company_member()` / `is_super_admin()` token in the
-- function body.
--
-- This is the WARN-level companion to v0.57 (P0 SECDEF bypasses),
-- v0.58 (cross-tenant storage + payment_integrations policies) and
-- v0.59 (function grants + FORCE RLS + dead code). The previous
-- batches closed the critical cross-tenant data leaks; this batch
-- closes the broader attack surface flagged by the advisor's static
-- grep.
--
-- Categorization (verified 2026-07-02 by reading every function body
-- in pg_proc and every cross-reference in src/):
--
--   Category A — REVOKE from authenticated, GRANT service_role
--     Pure-internal / cron / lifecycle-hook / payment-vault functions
--     that have no legitimate frontend caller. Includes the three
--     CRITICAL payment-vault functions that the v0.57 batch missed:
--       vault_store_redsys_secret  (any auth user could WRITE a secret)
--       vault_redsys_key_exists   (existence side-channel)
--       run_data_retention_now    (any auth user could TRIGGER DELETE)
--     Also includes 12 other cron/lifecycle functions that should
--     never be called from the CRM UI.
--
--   Category B — ALTER FUNCTION ... SECURITY INVOKER
--     Frontend-callable functions where the body does a single-table
--     mutation or a tenant-scoped read. Switching to SECURITY
--     INVOKER delegates the tenant check to the RLS policies that
--     already exist on the target tables (verified 2026-07-02 by
--     reading pg_policies for bookings, client_bonuses, clients,
--     notifications, projects, ticket_stages, docs_articles,
--     docs_categories, mail_messages, company_email_accounts,
--     company_modules). All target policies enforce
--     `company_id IN (caller's active memberships)`.
--
--   Category C — REVOKE from authenticated, GRANT anon
--     Token-based consent / invitation flows called from email
--     landing pages. The token IS the authorization; the functions
--     filter by token in their WHERE clause, so anon access is
--     safe and authenticated access would let a logged-in user
--     spoof any other user's token.
--
--   Category D — KEEP as-is (helper / already protected)
--     `is_company_member`, `is_super_admin` (2 overloads),
--     `is_super_admin_by_internal_id`, `verifactu_status`,
--     `client_get_visible_quotes`, `client_get_visible_tickets`,
--     `company_has_module`. These use `auth.uid()` /
--     `get_my_public_id()` / `auth_user_email()` indirectly via
--     subqueries or are read-only helpers whose return value is
--     not tenant-sensitive. The advisor's static grep missed the
--     indirect auth tokens.
--
-- Functions ALREADY fixed in v0.57-v0.59 (skipped here):
--   vault_get_redsys_secret, redsys_finalize_payment (v0.57 part 1)
--   use_client_bono (v0.58 part 2 body check)
--   accept_quote_for_booking (v0.58 part 2 INVOKER)
--   bulk_assign_unlinked_bookings (v0.58 part 2 INVOKER)
--   count_orphan_invoices, get_my_user_id, verifactu_status grants (v0.59)
--
-- DEVIATION FROM USER BRIEF
-- ────────────────────────────────────────────────────────────────────────────
-- The 2026-07-02 brief also flagged `update_company_user` as a "CRITICAL"
-- Category A target. After reading the body, the function already has
-- proper auth.uid()-based caller validation (joins users +
-- company_members + app_roles on auth.uid() and checks that the target
-- user has membership in the caller's company). The advisor's grep
-- missed the indirect auth.uid() token. Moving it to Category A would
-- break the existing frontend caller at src/app/services/auth.service.ts:2377.
-- Decision: leave update_company_user as-is (already safe). Same applies
-- to `upsert_company_payment_config`, `transfer_client_assignment`,
-- `update_service_variant_rpc`, `upsert_user_module` — all have body-level
-- auth.uid() checks that the grep missed and are not in the 47-list.
--
-- The 47 in this migration correspond to the actual rows in pg_proc for
-- the function names in the 2026-07-02 brief. create_customer_dev has
-- 3 overloads (not 4 as the brief said; the third is already
-- SECURITY INVOKER). create_notification has 2 overloads (not 4).
-- create_booking_with_resource has 2 overloads. is_super_admin has
-- 2 overloads. The remaining names have 1 signature each.
-- ============================================================================

BEGIN;

-- ============================================================================
-- CATEGORY A — REVOKE EXECUTE FROM authenticated, GRANT service_role
-- 15 functions: pure internal / cron / lifecycle / payment-vault
-- ============================================================================

DO $$
DECLARE
  fn text;
  fn_args text;
  fn_list text[] := ARRAY[
    '_build_duplicate_clusters',
    'create_invoice_for_booking',
    'create_invoice_for_installment',
    'create_mail_system_folders',
    'dispatch_due_budget_notifications',
    'dispatch_quote_event',
    'dispatch_send_budget_notification',
    'ensure_default_invoice_series',
    'find_similar_emails_rpc',
    'generate_payment_plan',
    'run_data_retention_now',
    'sync_company_max_users',
    'sync_company_modules_to_plan',
    'vault_redsys_key_exists',
    'vault_store_redsys_secret'
  ];
BEGIN
  FOREACH fn IN ARRAY fn_list LOOP
    -- REVOKE from PUBLIC (covers anon + authenticated)
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM anon', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM authenticated', fn);
    -- GRANT to service_role (cron, edge functions, migrations)
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO service_role', fn);
    RAISE NOTICE '[v0.60 Cat-A] revoked auth, granted service_role: %', fn;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.run_data_retention_now(uuid) IS
  'Manual data-retention trigger. SECURITY DEFINER + service_role-only (Rafter v0.60). Was callable by any authenticated user before this batch — that allowed any signed-in user to trigger SOFT DELETE of clients, ARCHIVE of bookings, and HARD DELETE of withdrawn_consent rows for any company.';
COMMENT ON FUNCTION public.vault_store_redsys_secret(uuid, text) IS
  'Stores a Redsys payment secret in vault.secrets. SECURITY DEFINER + service_role-only (Rafter v0.60). Was callable by any authenticated user before this batch — that allowed any signed-in user to overwrite another company''s payment processor secret.';
COMMENT ON FUNCTION public.vault_redsys_key_exists(uuid) IS
  'Existence side-channel for Redsys vault keys. SECURITY DEFINER + service_role-only (Rafter v0.60). Was callable by any authenticated user before this batch.';

-- ============================================================================
-- CATEGORY B — ALTER FUNCTION ... SECURITY INVOKER
-- 21 function signatures (with overloads). RLS on target tables provides
-- the tenant check; verified 2026-07-02 via pg_policies.
-- ============================================================================

-- Single-signature functions
ALTER FUNCTION public.auto_file_repeat_sender_rpc(uuid, integer, boolean) SECURITY INVOKER;
ALTER FUNCTION public.auto_file_starred_rpc(uuid, text, boolean, double precision) SECURITY INVOKER;
ALTER FUNCTION public.book_slot(uuid, timestamp with time zone, timestamp with time zone, jsonb) SECURITY INVOKER;
ALTER FUNCTION public.create_client_bono(uuid, uuid, uuid, uuid, integer, timestamp with time zone) SECURITY INVOKER;
ALTER FUNCTION public.delete_customer_dev(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.detect_duplicate_clients(uuid) SECURITY INVOKER;
ALTER FUNCTION public.docs_reorder_articles(uuid, uuid[]) SECURITY INVOKER;
ALTER FUNCTION public.docs_reorder_categories(uuid[]) SECURITY INVOKER;
ALTER FUNCTION public.generate_privacy_policy_html(uuid) SECURITY INVOKER;
ALTER FUNCTION public.list_company_members(uuid) SECURITY INVOKER;
ALTER FUNCTION public.reorder_projects(uuid, uuid[]) SECURITY INVOKER;
ALTER FUNCTION public.retention_records(text, text, integer, integer) SECURITY INVOKER;
ALTER FUNCTION public.retention_summary() SECURITY INVOKER;
ALTER FUNCTION public.safe_delete_ticket_stage(uuid, uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.scan_incomplete_bookings(uuid) SECURITY INVOKER;
ALTER FUNCTION public.search_customers_dev(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.send_test_company_email(uuid, text) SECURITY INVOKER;

-- Multi-signature overloads
-- create_booking_with_resource (2 overloads)
ALTER FUNCTION public.create_booking_with_resource(uuid, timestamp with time zone, timestamp with time zone, jsonb, text) SECURITY INVOKER;
ALTER FUNCTION public.create_booking_with_resource(uuid, timestamp with time zone, timestamp with time zone, jsonb, text, uuid, jsonb) SECURITY INVOKER;

-- create_customer_dev: only the 2 SECDEF overloads. The 3rd (text-based)
-- is already SECURITY INVOKER (verified 2026-07-02 via pg_proc).
ALTER FUNCTION public.create_customer_dev(uuid, character varying, character varying, character varying, character varying, character varying) SECURITY INVOKER;
ALTER FUNCTION public.create_customer_dev(uuid, character varying, character varying, character varying, character varying, character varying, date, character varying, character varying, text, text, uuid) SECURITY INVOKER;

-- create_notification (2 overloads — the 4-overload count in the brief
-- reflects historical aliases that have since been dropped)
ALTER FUNCTION public.create_notification(uuid, uuid, text, uuid, text, text, jsonb) SECURITY INVOKER;
ALTER FUNCTION public.create_notification(uuid, uuid, text, text, text, uuid, jsonb) SECURITY INVOKER;

-- After switching to INVOKER, authenticated needs an explicit grant
-- (Postgres does not retain the original DEFINER grant chain).
GRANT EXECUTE ON FUNCTION public.auto_file_repeat_sender_rpc(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_file_starred_rpc(uuid, text, boolean, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_slot(uuid, timestamp with time zone, timestamp with time zone, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_with_resource(uuid, timestamp with time zone, timestamp with time zone, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_with_resource(uuid, timestamp with time zone, timestamp with time zone, jsonb, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_bono(uuid, uuid, uuid, uuid, integer, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_dev(uuid, character varying, character varying, character varying, character varying, character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_dev(uuid, character varying, character varying, character varying, character varying, character varying, date, character varying, character varying, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, uuid, text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, uuid, text, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_customer_dev(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_duplicate_clients(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.docs_reorder_articles(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.docs_reorder_categories(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_privacy_policy_html(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_company_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_projects(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retention_records(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retention_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.safe_delete_ticket_stage(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scan_incomplete_bookings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_customers_dev(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_test_company_email(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.book_slot(uuid, timestamp with time zone, timestamp with time zone, jsonb) IS
  'Books a slot. SECURITY INVOKER (Rafter v0.60) — RLS on bookings (bookings_insert policy) enforces company_id match between caller''s active memberships and the booking row. Was SECURITY DEFINER before v0.60.';
COMMENT ON FUNCTION public.create_booking_with_resource(uuid, timestamp with time zone, timestamp with time zone, jsonb, text) IS
  'Books with auto resource assignment. SECURITY INVOKER (Rafter v0.60) — RLS on bookings enforces tenancy. Was SECURITY DEFINER before v0.60.';
COMMENT ON FUNCTION public.list_company_members(uuid) IS
  'Lists members of a company. SECURITY INVOKER (Rafter v0.60) — RLS on company_members (Members can view company peers) restricts to caller''s active memberships. Was SECURITY DEFINER before v0.60. Body still has its existing current_user_is_admin() short-circuit returning json{success:false} for non-admins, but the WHERE-clause tenant filter is now enforced by RLS.';
COMMENT ON FUNCTION public.run_data_retention_now(uuid) IS
  'Manual data-retention trigger. SECURITY DEFINER + service_role-only (Rafter v0.60). Was callable by any authenticated user before this batch — that allowed any signed-in user to trigger SOFT DELETE of clients, ARCHIVE of bookings, and HARD DELETE of withdrawn_consent rows for any company.';

-- ============================================================================
-- CATEGORY C — REVOKE from authenticated, GRANT anon
-- 3 functions: token-based consent / invitation flows
-- ============================================================================

DO $$
DECLARE
  fn text;
  fn_list text[] := ARRAY[
    'process_email_consent',
    'reject_client_consent',
    'reject_company_invitation'
  ];
BEGIN
  FOREACH fn IN ARRAY fn_list LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO service_role', fn);
    RAISE NOTICE '[v0.60 Cat-C] revoked auth, granted anon + service_role: %', fn;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.reject_company_invitation(text, uuid) IS
  'Token-based invitation reject. anon + service_role-only (Rafter v0.60). The p_token is the authorization. Was callable by any authenticated user before this batch — that allowed any signed-in user to reject any pending invitation by passing an arbitrary token. NOTE: this changes the call contract for the invite component at src/app/features/auth/invite/invite.component.ts:422 — that caller must now go through the anon Supabase client (e.g. SupabaseClientService.publicClient) instead of the authed one.';

-- ============================================================================
-- CATEGORY D — KEEP AS-IS (helpers / already protected)
-- 8 function signatures: auth-helpers + portal read helpers
-- ============================================================================
-- is_company_member: uses get_my_public_id() which calls auth.uid()
-- is_super_admin (2 overloads): uses auth.uid() directly
-- is_super_admin_by_internal_id: deliberate internal-only helper, no auth.uid by design
-- verifactu_status: read-only status query, no tenant-sensitive output
-- client_get_visible_quotes / client_get_visible_tickets: portal read
--   helpers that filter by auth_user_email() = caller.email via
--   client_portal_users; SECURITY DEFINER is intentional because the
--   portal caller is NOT in company_members.
-- company_has_module: read-only true/false helper; result is not
--   tenant-sensitive (just module-on/off for a company).
-- No action.

-- ============================================================================
-- Re-affirm the final grant posture: anything that was authed must remain
-- authed, anything we revoked from auth must remain revoked from auth.
-- ============================================================================

-- Category A: confirm only service_role + owner (postgres) retain EXECUTE
DO $$
DECLARE
  fn text;
  unexpected_grantee text;
  fn_list text[] := ARRAY[
    '_build_duplicate_clusters',
    'create_invoice_for_booking',
    'create_invoice_for_installment',
    'create_mail_system_folders',
    'dispatch_due_budget_notifications',
    'dispatch_quote_event',
    'dispatch_send_budget_notification',
    'ensure_default_invoice_series',
    'find_similar_emails_rpc',
    'generate_payment_plan',
    'run_data_retention_now',
    'sync_company_max_users',
    'sync_company_modules_to_plan',
    'vault_redsys_key_exists',
    'vault_store_redsys_secret'
  ];
BEGIN
  FOREACH fn IN ARRAY fn_list LOOP
    SELECT grantee INTO unexpected_grantee
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = fn
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    LIMIT 1;
    IF unexpected_grantee IS NOT NULL THEN
      RAISE EXCEPTION '[v0.60 Cat-A verify] % still granted to %', fn, unexpected_grantee;
    END IF;
  END LOOP;
  RAISE NOTICE '[v0.60 Cat-A verify] all 15 functions revoked from auth/anon/PUBLIC';
END $$;

-- Category C: confirm only anon + service_role + owner retain EXECUTE
DO $$
DECLARE
  fn text;
  unexpected_grantee text;
  fn_list text[] := ARRAY[
    'process_email_consent',
    'reject_client_consent',
    'reject_company_invitation'
  ];
BEGIN
  FOREACH fn IN ARRAY fn_list LOOP
    SELECT grantee INTO unexpected_grantee
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = fn
      AND grantee IN ('PUBLIC', 'authenticated')
    LIMIT 1;
    IF unexpected_grantee IS NOT NULL THEN
      RAISE EXCEPTION '[v0.60 Cat-C verify] % still granted to %', fn, unexpected_grantee;
    END IF;
  END LOOP;
  RAISE NOTICE '[v0.60 Cat-C verify] all 3 functions revoked from auth/PUBLIC';
END $$;

COMMIT;