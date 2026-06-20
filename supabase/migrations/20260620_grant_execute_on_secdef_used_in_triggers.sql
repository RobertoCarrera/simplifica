-- Migration: grant_execute_on_secdef_used_in_triggers
-- Sprint: Rafter v0.11 POST-FIX (CRITICAL)
-- Author: Roberto + AI
-- Date: 2026-06-20
--
-- STATUS: APPLIED 2026-06-20
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND — CRITICAL POST-MORTEM FIX
-- ────────────────────────────────────────────────────────────────────────────
--
-- The Rafter v0.11 analysis (commit 17d34558) claimed to verify that
-- no revoked SECDEFINER function was referenced in triggers, but the
-- check was BROKEN. The query used was:
--
--   (SELECT count(*) FROM pg_trigger t
--    WHERE t.tgrelid::regclass::text ILIKE '%' || p.proname || '%') AS trigger_count
--
-- This matched if the TABLE NAME contained the function name (e.g. a
-- table named `gdpr_consent_records` would match `gdpr_consent_records`
-- as a "trigger reference" for function `gdpr_consent_records`). It
-- did NOT verify that the trigger's FUNCTION (tgfoid) matched the
-- SECDEFINER function.
--
-- The correct check is:
--
--   SELECT t.tgname, c.relname
--   FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid
--   JOIN pg_class c ON c.oid = t.tgrelid
--   WHERE p.proname = '<function_name>'
--
-- ────────────────────────────────────────────────────────────────────────────
-- DAMAGE CAUSED
-- ────────────────────────────────────────────────────────────────────────────
--
-- 21 SECDEFINER functions revoked in v0.11a-e are called by 28 SQL triggers.
-- When authenticated users do INSERT/UPDATE/DELETE on the affected tables,
-- the trigger fires and tries to call the revoked function → permission
-- denied → INSERT/UPDATE/DELETE fails.
--
-- Affected tables (examples):
-- - invoices, quotes, bookings (financial transactions broken)
-- - clients, client_clinical_notes (customer data broken)
-- - tickets, ticket_devices (support broken)
-- - mail_messages (mail sync broken)
-- - notifications (push notifications broken)
-- - gdpr_access_requests, gdpr_consent_records (compliance broken)
-- - recurring_budgets, client_variant_assignments (automation broken)
-- - projects, company_modules (admin broken)
--
-- This migration restores EXECUTE for all 21 functions to prevent the
-- triggers from failing.
--
-- ────────────────────────────────────────────────────────────────────────────
-- FUNCTIONS RESTORED (21 total, covering 28 triggers)
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- check_retention_before_delete: 8 triggers (audit_logs, clients, invoices, quotes, client_clinical_notes, gdpr_consent_records, bookings, booking_clinical_notes, booking_documents)
GRANT EXECUTE ON FUNCTION public.check_retention_before_delete() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_retention_before_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_retention_before_delete() TO anon;

-- activate_recurring_service_on_payment: tr_activate_recurring_service on invoices
GRANT EXECUTE ON FUNCTION public.activate_recurring_service_on_payment() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_recurring_service_on_payment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_recurring_service_on_payment() TO anon;

-- auto_assign_client_creator: trg_auto_assign_client_creator on clients
GRANT EXECUTE ON FUNCTION public.auto_assign_client_creator() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_assign_client_creator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_assign_client_creator() TO anon;

-- auto_create_availability_schedules_for_company: trg_auto_availability_schedules on company_modules
GRANT EXECUTE ON FUNCTION public.auto_create_availability_schedules_for_company() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_create_availability_schedules_for_company() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_create_availability_schedules_for_company() TO anon;

-- gdpr_breach_created_notify: gdpr_breach_created_audit on gdpr_breach_incidents
GRANT EXECUTE ON FUNCTION public.gdpr_breach_created_notify() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.gdpr_breach_created_notify() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_breach_created_notify() TO anon;

-- maintain_ticket_opened_status: trigger_maintain_opened_status on tickets
GRANT EXECUTE ON FUNCTION public.maintain_ticket_opened_status() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.maintain_ticket_opened_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.maintain_ticket_opened_status() TO anon;

-- notify_booking_notifier: on_booking_changes on bookings
GRANT EXECUTE ON FUNCTION public.notify_booking_notifier() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_booking_notifier() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_booking_notifier() TO anon;

-- notify_holded_booking_confirmed: trg_holded_booking_confirmed on bookings
GRANT EXECUTE ON FUNCTION public.notify_holded_booking_confirmed() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_holded_booking_confirmed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_holded_booking_confirmed() TO anon;

-- notify_holded_booking_estimate: trg_holded_booking_estimate on bookings
GRANT EXECUTE ON FUNCTION public.notify_holded_booking_estimate() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_holded_booking_estimate() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_holded_booking_estimate() TO anon;

-- notify_on_recurring_budget_created: trg_notify_on_recurring_budget_created on recurring_budgets
GRANT EXECUTE ON FUNCTION public.notify_on_recurring_budget_created() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_on_recurring_budget_created() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_recurring_budget_created() TO anon;

-- notify_on_service_contract: trg_notify_on_service_contract on client_variant_assignments
GRANT EXECUTE ON FUNCTION public.notify_on_service_contract() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_on_service_contract() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_on_service_contract() TO anon;

-- notify_owner_on_gdpr_request: on_gdpr_request_created on gdpr_access_requests
GRANT EXECUTE ON FUNCTION public.notify_owner_on_gdpr_request() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_owner_on_gdpr_request() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_owner_on_gdpr_request() TO anon;

-- notify_push_on_notification_insert: trg_push_on_notification_insert on notifications
GRANT EXECUTE ON FUNCTION public.notify_push_on_notification_insert() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_push_on_notification_insert() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_push_on_notification_insert() TO anon;

-- notify_session_created: trg_notify_session_created on bookings
GRANT EXECUTE ON FUNCTION public.notify_session_created() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_session_created() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_session_created() TO anon;

-- seed_gdpr_processing_activities: trg_seed_activities_on_company_insert on companies
GRANT EXECUTE ON FUNCTION public.seed_gdpr_processing_activities() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_gdpr_processing_activities() TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_gdpr_processing_activities() TO anon;

-- set_initial_ticket_stage: ensure_initial_stage_insert on tickets
GRANT EXECUTE ON FUNCTION public.set_initial_ticket_stage() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_initial_ticket_stage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_initial_ticket_stage() TO anon;

-- set_ticket_number: trg_set_ticket_number on tickets
GRANT EXECUTE ON FUNCTION public.set_ticket_number() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_ticket_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ticket_number() TO anon;

-- sync_gdpr_to_client_consent: on_gdpr_consent_sync_client on gdpr_consent_records
GRANT EXECUTE ON FUNCTION public.sync_gdpr_to_client_consent() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_gdpr_to_client_consent() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_gdpr_to_client_consent() TO anon;

-- update_client_stats_on_change: trigger_update_client_stats on clients
GRANT EXECUTE ON FUNCTION public.update_client_stats_on_change() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_client_stats_on_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_stats_on_change() TO anon;

-- update_mail_folder_unread_count: mail_messages_update_unread_count on mail_messages
GRANT EXECUTE ON FUNCTION public.update_mail_folder_unread_count() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_mail_folder_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_mail_folder_unread_count() TO anon;

-- validate_project_association: trg_validate_project_association on projects
GRANT EXECUTE ON FUNCTION public.validate_project_association() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_project_association() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_project_association() TO anon;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────
--
-- SELECT t.tgname, c.relname AS table_name, p.proname AS function_name,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok
-- FROM pg_trigger t
-- JOIN pg_proc p ON p.oid = t.tgfoid
-- JOIN pg_class c ON c.oid = t.tgrelid
-- JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
-- WHERE p.proname IN ('check_retention_before_delete', 'activate_recurring_service_on_payment', ...)
-- ORDER BY p.proname;
--
-- Expected: all auth_ok = true
--
-- ────────────────────────────────────────────────────────────────────────────
-- CORRECT QUERY FOR FUTURE REVOKE ANALYSIS
-- ────────────────────────────────────────────────────────────────────────────
--
-- Before any future REVOKE migration, run:
--
-- WITH target AS (
--   SELECT proname FROM pg_proc WHERE proname IN (... functions to revoke ...)
-- )
-- SELECT t.proname AS target_function,
--        'TRIGGER' AS ref_type,
--        tr.tgname AS ref_name,
--        c.relname AS table_name
-- FROM target t
-- JOIN pg_proc p ON p.proname = t.proname
-- JOIN pg_trigger tr ON tr.tgfoid = p.oid
-- JOIN pg_class c ON c.oid = tr.tgrelid
-- UNION ALL
-- SELECT t.proname, 'POLICY', pol.policyname, pol.tablename
-- FROM target t
-- JOIN pg_policies pol ON pol.schemaname = 'public'
--   AND (pol.qual ILIKE '%' || t.proname || '%' OR pol.with_check ILIKE '%' || t.proname || '%')
-- UNION ALL
-- SELECT t.proname, 'VIEW', v.viewname, NULL
-- FROM target t
-- JOIN pg_views v ON v.schemaname = 'public' AND v.definition ILIKE '%' || t.proname || '%'
-- ORDER BY 1, 2;
--
-- If any rows are returned, the function CANNOT be safely revoked.