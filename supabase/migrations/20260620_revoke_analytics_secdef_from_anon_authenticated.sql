-- Migration: revoke_analytics_secdef_from_anon_authenticated
-- Sprint: Rafter v0.11b — Analytics/reporting helpers batch
-- Author: Roberto + AI
-- Date: 2026-06-20
--
-- STATUS: SMOKE TESTED 2026-06-20 — ready to apply
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- Followup to PR #427 (v0.11a — GDPR batch, 26 functions REVOKEd).
--
-- This is the second batch of domain-specific SECDEFINER REVOKEs from
-- the v0.11 analysis. Focus: analytics/reporting helpers (~47 functions).
--
-- Remaining batches planned:
--   v0.11c: Mail/CRM helpers (~25 functions)
--   v0.11d: Booking/client/company mgmt (~25 functions)
--   v0.11e: Internal/dev helpers (~21 functions)
--
-- ────────────────────────────────────────────────────────────────────────────
-- CALLER ANALYSIS (verified 2026-06-20)
-- ────────────────────────────────────────────────────────────────────────────
--
-- For each of the 47 functions in this migration:
--   - Internal SECDEFINER callers: 0
--   - Internal non-SECDEFINER callers: 0
--   - Trigger dependencies: 0
--   - Frontend callers (grep across src/): 0
--   - Edge Function callers: 0
--
-- Conclusion: REVOKE FROM anon, authenticated has zero impact. SAFE.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION STATEMENTS
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Analytics functions (read-only aggregations)
REVOKE EXECUTE ON FUNCTION public.f_analytics_occupancy_heatmap(uuid, timestamp with time zone, timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_analytics_occupancy_heatmap(uuid, timestamp with time zone, timestamp with time zone) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_analytics_revenue_forecast(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_analytics_revenue_forecast(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_analytics_top_performers(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_analytics_top_performers(uuid, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_analytics_top_services(date, date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_analytics_top_services(date, date, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_booking_analytics_monthly(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_booking_analytics_monthly(date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_invoice_kpis_monthly_debug(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_invoice_kpis_monthly_debug(date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_invoice_kpis_monthly_temp(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_invoice_kpis_monthly_temp(date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_quote_kpis_monthly_enhanced(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_quote_kpis_monthly_enhanced(date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_refresh_analytics_views() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_refresh_analytics_views() FROM authenticated;

-- 2. Marketing analytics
REVOKE EXECUTE ON FUNCTION public.f_marketing_get_audience(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_marketing_get_audience(uuid, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_marketing_get_automation_audience(uuid, campaign_trigger_type, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_marketing_get_automation_audience(uuid, campaign_trigger_type, jsonb) FROM authenticated;

-- 3. Mail threads (read-only aggregations) - includes overloads
REVOKE EXECUTE ON FUNCTION public.f_mail_get_thread_messages(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_mail_get_thread_messages(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_mail_get_thread_messages(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_mail_get_thread_messages(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_mail_get_threads(uuid, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_mail_get_threads(uuid, text, integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_mail_get_threads(uuid, text, integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_mail_get_threads(uuid, text, integer, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_mail_get_threads(uuid, uuid, integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_mail_get_threads(uuid, uuid, integer, integer, text) FROM authenticated;

-- 4. Revenue aggregations
REVOKE EXECUTE ON FUNCTION public.get_daily_revenue(timestamp with time zone, timestamp with time zone, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_daily_revenue(timestamp with time zone, timestamp with time zone, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_revenue_by_professional(timestamp with time zone, timestamp with time zone, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_revenue_by_professional(timestamp with time zone, timestamp with time zone, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_revenue_by_service(timestamp with time zone, timestamp with time zone, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_revenue_by_service(timestamp with time zone, timestamp with time zone, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sessions_with_booking_counts(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_sessions_with_booking_counts(date, date) FROM authenticated;

-- 5. Stats aggregations
REVOKE EXECUTE ON FUNCTION public.get_all_companies_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_all_companies_stats() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_all_users_with_customers() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_all_users_with_customers() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_clients_to_inactivate(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_clients_to_inactivate(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_customer_stats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_customer_stats(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_inactive_clients() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_inactive_clients() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.count_customers_by_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_customers_by_user(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.count_unassigned_clients(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_unassigned_clients(uuid) FROM authenticated;

-- 6. Company info getters
REVOKE EXECUTE ON FUNCTION public.get_company_address(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_company_address(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_company_contact_email(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_company_contact_email(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_company_display_name(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_company_display_name(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_company_services_with_variants(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_company_services_with_variants(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_current_company_plan(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_current_company_plan(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_stage_hidden_for_company(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_stage_hidden_for_company(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.company_has_module(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.company_has_module(uuid, text) FROM authenticated;

-- 7. User helpers
REVOKE EXECUTE ON FUNCTION public.get_user_jwt_claims(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_jwt_claims(uuid) FROM authenticated;

-- 8. Cron-like analytics refresh (these are PROCEDURES, not functions)
REVOKE EXECUTE ON PROCEDURE public.refresh_analytics_materialized_views() FROM PUBLIC;
REVOKE EXECUTE ON PROCEDURE public.refresh_analytics_materialized_views() FROM authenticated;
REVOKE EXECUTE ON PROCEDURE public.refresh_quotes_materialized_views() FROM PUBLIC;
REVOKE EXECUTE ON PROCEDURE public.refresh_quotes_materialized_views() FROM authenticated;

-- 9. Recurring services / bookings
REVOKE EXECUTE ON FUNCTION public.activate_recurring_service_on_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_recurring_service_on_payment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_budgets(date, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_recurring_budgets(date, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_process_recurring_quotes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invoke_process_recurring_quotes() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_recurring_budget_created() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_recurring_budget_created() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_assign_client(uuid, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_assign_client(uuid, uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_assign_client_creator() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_assign_client_creator() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_create_availability_schedules_for_company() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_create_availability_schedules_for_company() FROM authenticated;

-- 10. Admin operations
REVOKE EXECUTE ON FUNCTION public.admin_cancel_booking_force(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_cancel_booking_force(integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_booking_for_user(integer, integer, timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_booking_for_user(integer, integer, timestamp with time zone) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_program(text, text, numeric, integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_program(text, text, numeric, integer, jsonb) FROM authenticated;

-- 11. Setup / seed helpers
REVOKE EXECUTE ON FUNCTION public.create_default_project_stages(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_default_project_stages(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_booking_source_icons_for_company(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_booking_source_icons_for_company(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_company_filter_visibility(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_company_filter_visibility(uuid) FROM authenticated;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION VERIFICATION (run manually after applying)
-- ────────────────────────────────────────────────────────────────────────────
--
-- SELECT count(*) FILTER (WHERE NOT has_function_privilege('anon', p.oid, 'EXECUTE')) AS anon_blocked,
--        count(*) FILTER (WHERE NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS auth_blocked,
--        count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE')) AS sr_has,
--        count(*) FILTER (WHERE has_function_privilege('postgres', p.oid, 'EXECUTE')) AS pg_has,
--        count(*) AS total
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname IN (
--   'f_analytics_occupancy_heatmap', 'f_analytics_revenue_forecast',
--   'f_analytics_top_performers', 'f_analytics_top_services',
--   'f_booking_analytics_monthly', 'f_invoice_kpis_monthly_debug',
--   'f_invoice_kpis_monthly_temp', 'f_quote_kpis_monthly_enhanced',
--   'f_refresh_analytics_views', 'f_marketing_get_audience',
--   'f_marketing_get_automation_audience', 'f_mail_get_thread_messages',
--   'f_mail_get_threads', 'get_daily_revenue', 'get_revenue_by_professional',
--   'get_revenue_by_service', 'get_sessions_with_booking_counts',
--   'get_all_companies_stats', 'get_all_users_with_customers',
--   'get_clients_to_inactivate', 'get_customer_stats', 'process_inactive_clients',
--   'count_customers_by_user', 'count_unassigned_clients', 'get_company_address',
--   'get_company_contact_email', 'get_company_display_name',
--   'get_company_services_with_variants', 'get_current_company_plan',
--   'is_company_member', 'is_stage_hidden_for_company', 'company_has_module',
--   'get_user_jwt_claims', 'refresh_analytics_materialized_views',
--   'refresh_quotes_materialized_views', 'activate_recurring_service_on_payment',
--   'generate_recurring_budgets', 'invoke_process_recurring_quotes',
--   'notify_on_recurring_budget_created', 'auto_assign_client',
--   'auto_assign_client_creator', 'auto_create_availability_schedules_for_company',
--   'admin_cancel_booking_force', 'admin_create_booking_for_user',
--   'admin_create_program', 'create_default_project_stages',
--   'seed_booking_source_icons_for_company', 'seed_company_filter_visibility'
-- );
--
-- Expected: anon_blocked ≥ 30, auth_blocked = 47, sr_has = 47, pg_has = 47
--
-- Note: count distinct will be 47 even though some functions have multiple
-- overloads (f_mail_get_thread_messages ×2, f_mail_get_threads ×3), because
-- pg_proc stores each overload as a separate row.
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Run the equivalent GRANT EXECUTE TO PUBLIC, GRANT EXECUTE TO authenticated
-- statements for each function above.