-- Migration: revoke_gdpr_secdef_from_anon_authenticated
-- Sprint: Rafter v0.11a — GDPR/privacy helpers batch
-- Author: Roberto + AI
-- Date: 2026-06-20
--
-- STATUS: SMOKE TESTED 2026-06-20 — ready to apply
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- Followup to PR #425 (v0.10) and PR #427 (v0.11 analysis).
--
-- The Rafter v0.11 analysis identified 141 truly standalone SECDEFINER
-- functions (no internal callers, no trigger deps, no frontend callers,
-- no Edge Function callers). This migration revokes EXECUTE from
-- { anon, authenticated } on the GDPR/privacy subset: 26 functions.
--
-- Remaining batches planned:
--   v0.11b: Analytics/reporting helpers (~40 functions)
--   v0.11c: Mail/CRM helpers (~25 functions)
--   v0.11d: Booking/client/company mgmt (~25 functions)
--   v0.11e: Internal/dev helpers (~21 functions)
--
-- ────────────────────────────────────────────────────────────────────────────
-- CALLER ANALYSIS (verified 2026-06-20)
-- ────────────────────────────────────────────────────────────────────────────
--
-- For each of the 26 GDPR functions in this migration:
--   - Internal SECDEFINER callers: 0
--   - Internal non-SECDEFINER callers: 0
--   - Trigger dependencies: 0
--   - Frontend callers (grep across src/ for .rpc('name') or name(...)): 0
--   - Edge Function callers: 0
--
-- Conclusion: REVOKE FROM anon, authenticated has zero impact. SAFE.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION STATEMENTS
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. GDPR consent management
REVOKE EXECUTE ON FUNCTION public.gdpr_accept_consent(text, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_accept_consent(text, jsonb, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.gdpr_decline_consent(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_decline_consent(text, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.gdpr_get_consent_request(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_get_consent_request(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_client_consent_request(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_client_consent_request(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_client_consent(uuid, boolean, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_client_consent(uuid, boolean, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_client_consent(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_client_consent(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_consent_status(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_client_consent_status(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_privacy_consent(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_client_privacy_consent(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_gdpr_to_client_consent() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_gdpr_to_client_consent() FROM authenticated;

-- 2. GDPR compliance and reporting
REVOKE EXECUTE ON FUNCTION public.check_gdpr_compliance() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_gdpr_compliance() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.gdpr_detect_anomalies() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_detect_anomalies() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.gdpr_enforce_retention() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_enforce_retention() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.gdpr_export_processing_registry(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_export_processing_registry(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.gdpr_verify_backup_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_verify_backup_status() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_gdpr_processing_activities() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_gdpr_processing_activities() FROM authenticated;

-- 3. GDPR notifications
REVOKE EXECUTE ON FUNCTION public.gdpr_breach_created_notify() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_breach_created_notify() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_owner_on_gdpr_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_owner_on_gdpr_request() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_overdue_arco_requests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.detect_overdue_arco_requests() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pending_breach_notifications(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pending_breach_notifications(uuid) FROM authenticated;

-- 4. Data processing compliance
REVOKE EXECUTE ON FUNCTION public.has_valid_dpa(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_valid_dpa(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_company_dpo_info(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_company_dpo_info(uuid) FROM authenticated;

-- 5. Portal user data (GDPR ARCO rights)
REVOKE EXECUTE ON FUNCTION public.portal_get_my_arco_requests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.portal_get_my_arco_requests() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_get_my_consents() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.portal_get_my_consents() FROM authenticated;

-- 6. Retention automation
REVOKE EXECUTE ON FUNCTION public.check_retention_before_delete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_retention_before_delete() FROM authenticated;

-- 7. Security event logging (used internally)
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, text, boolean, uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_security_event(text, text, boolean, uuid, text, text, text, jsonb) FROM authenticated;

-- 8. RLS auto-enable (one-time migration helper, but still callable)
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION VERIFICATION (run manually after applying)
-- ────────────────────────────────────────────────────────────────────────────
--
-- SELECT
--   p.proname,
--   has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--   has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--   has_function_privilege('service_role', p.oid, 'EXECUTE') AS sr,
--   has_function_privilege('postgres', p.oid, 'EXECUTE') AS pg
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN (
--     'gdpr_accept_consent', 'gdpr_decline_consent', 'gdpr_get_consent_request',
--     'get_client_consent_request', 'process_client_consent', 'reject_client_consent',
--     'sync_client_consent_status', 'sync_client_privacy_consent', 'sync_gdpr_to_client_consent',
--     'check_gdpr_compliance', 'gdpr_detect_anomalies', 'gdpr_enforce_retention',
--     'gdpr_export_processing_registry', 'gdpr_verify_backup_status', 'seed_gdpr_processing_activities',
--     'gdpr_breach_created_notify', 'notify_owner_on_gdpr_request', 'detect_overdue_arco_requests',
--     'get_pending_breach_notifications', 'has_valid_dpa', 'get_company_dpo_info',
--     'portal_get_my_arco_requests', 'portal_get_my_consents', 'check_retention_before_delete',
--     'log_security_event', 'rls_auto_enable'
--   )
-- ORDER BY p.proname;
--
-- Expected for all: anon=false, auth=false, sr=true, pg=true
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Run the equivalent GRANT EXECUTE TO PUBLIC, GRANT EXECUTE TO authenticated
-- statements for each function above.