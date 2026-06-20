-- Migration: set_search_path_on_public_functions
-- Sprint: Rafter v0.12 (search_path_mutable fix)
-- Author: Roberto + AI
-- Date: 2026-06-20

-- STATUS: SMOKE TESTED 2026-06-20 — ready to apply

-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────

-- Rafter Supabase linter reported 54 functions with role-mutable search_path.
-- When search_path is mutable, an attacker who can create objects in any
-- schema in the search_path could shadow legitimate tables/functions and
-- trick the function into using the attacker's objects. This is especially
-- dangerous for SECURITY DEFINER functions because they run with elevated
-- privileges.

-- Fix: ALTER FUNCTION ... SET search_path = public, pg_temp

-- This locks the search path to public schema first, then pg_temp (for
-- temporary objects). The function can no longer pick up attacker-created
-- objects from other schemas.

-- Note: this fix is non-destructive — we don't rewrite the function body,
-- just set the proconfig. Safe to apply.

-- Functions fixed: 55 pg_proc rows (54 distinct names)

-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION STATEMENTS
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER FUNCTION public.admin_create_program(p_name text, p_description text, p_price numeric, p_class_type_id integer, p_class_slots jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_upsert_addon(p_id text, p_name text, p_description text, p_icon text, p_price_cents integer, p_currency text, p_billing_period text, p_applies_to_plans text[], p_sort_order integer, p_is_active boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.admin_upsert_plan(p_id text, p_name text, p_tagline text, p_description text, p_base_price_cents integer, p_currency text, p_billing_period text, p_included_users integer, p_extra_user_cents integer, p_included_modules text[], p_sort_order integer, p_is_active boolean, p_is_highlighted boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.auth_user_id_from_token() SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_create_availability_schedules_for_company() SET search_path = public, pg_temp;
ALTER FUNCTION public.book_slot(p_professional_id uuid, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_booking_data jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.budget_notification_settings_validate_arrays() SET search_path = public, pg_temp;
ALTER FUNCTION public.calculate_recurrence_period(p_date date, p_type text) SET search_path = public, pg_temp;
ALTER FUNCTION public.cancel_company_invitation(p_invitation_id uuid, p_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_no_double_state() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_professional_blocked(p_professional_id uuid, p_start_time timestamp with time zone, p_end_time timestamp with time zone) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_retention_before_delete() SET search_path = public, pg_temp;
ALTER FUNCTION public.client_completeness_score(p_email text, p_phone text, p_business_name text, p_trade_name text, p_cif_nif text, p_dni text, p_direccion_id uuid, p_internal_notes text) SET search_path = public, pg_temp;
ALTER FUNCTION public.client_dedup_rollback() SET search_path = public, pg_temp;
ALTER FUNCTION public.count_unassigned_clients(p_company_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_booking_with_resource(p_professional_id uuid, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_booking_data jsonb, p_source text) SET search_path = public, pg_temp;
ALTER FUNCTION public.decrypt_company_email_credential(encrypted bytea) SET search_path = public, pg_temp;
ALTER FUNCTION public.decrypt_text(encrypted_hex text, key text) SET search_path = public, pg_temp;
ALTER FUNCTION public.detect_duplicate_clients_test() SET search_path = public, pg_temp;
ALTER FUNCTION public.docs_touch_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.encrypt_company_email_credential(plaintext text) SET search_path = public, pg_temp;
ALTER FUNCTION public.encrypt_text(plaintext text, key text) SET search_path = public, pg_temp;
ALTER FUNCTION public.find_client_by_phone_last9(p_company_id uuid, p_phone_last9 text) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_enforce_one_live_quote_per_booking() SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_professional_slug(p_display_name text, p_company_id uuid, p_existing_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_client_access_history(p_client_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_client_bonuses(p_client_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_pending_invitation_by_email(p_email text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_sidebar_navigation_order() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.is_company_owner(p_company_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_recurrence_day_match(p_date date, p_type text, p_day integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_name(p_name text) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_phone(p_phone text) SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_push_on_notification_insert() SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_session_created() SET search_path = public, pg_temp;
ALTER FUNCTION public.professional_auto_unpublish() SET search_path = public, pg_temp;
ALTER FUNCTION public.seed_booking_source_icons_for_company(p_company_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.send_test_company_email(p_account_id uuid, p_to_email text) SET search_path = public, pg_temp;
ALTER FUNCTION public.set_professional_slug() SET search_path = public, pg_temp;
ALTER FUNCTION public.slugify(text_to_slugify text) SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_inbound_mail_config_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_inbound_mail_global_config_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_check_blocked_dates() SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_contracted_services_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.trg_recurring_budgets_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_dpa_sent_on_contract_send() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_dpa_status_on_contract_sign() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_mail_folder_unread_count() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_project_subtask_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.upsert_client(payload jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.upsert_client(p_id uuid, p_data jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.use_client_bono(p_client_id uuid, p_variant_id uuid, p_service_id uuid, p_company_id uuid, p_sessions_to_use integer) SET search_path = public, pg_temp;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────

-- SELECT count(*) AS fixed
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proconfig::text LIKE '%search_path%';

-- Expected: at least 54 functions now have search_path set

-- Re-run Rafter linter:
-- Expected: 0 function_search_path_mutable warnings

-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- ────────────────────────────────────────────────────────────────────────────

-- ALTER FUNCTION public.{name}({args}) RESET search_path;
-- for each function in this migration.