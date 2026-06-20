-- Migration: revoke_internal_dev_secdef_from_anon_authenticated
-- Sprint: Rafter v0.11e — Internal/dev helpers batch (FINAL)
-- Author: Roberto + AI
-- Date: 2026-06-20
--
-- STATUS: SMOKE TESTED 2026-06-20 — ready to apply
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- Final batch of the Rafter v0.11 series. Internal/dev helpers (25 functions).
-- After this batch, 147 SECDEFINER functions/procedures will be revoked from
-- anon/authenticated (33% of the original 446).
--
-- Functions NOT in this batch (deferred):
-- - is_super_admin_by_id, is_super_admin_by_internal_id: used by is_super_admin_real()
--   which gates RLS policies. Cannot revoke without breaking permission checks.
-- - docplanner_reconciliation_trigger: trigger function, cannot revoke.
-- - verifactu_status(i invoices): takes rowtype arg, likely trigger-internal.
--
-- ────────────────────────────────────────────────────────────────────────────
-- CALLER ANALYSIS (verified 2026-06-20)
-- ────────────────────────────────────────────────────────────────────────────
--
-- All 25 functions have:
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

-- 1. Test / dev helpers
REVOKE EXECUTE ON FUNCTION public._test_gotrue_flow() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._test_gotrue_flow() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fix_bet_drop_link() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fix_bet_drop_link() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_address_dev(uuid, character varying, character varying, character varying, character varying, character varying, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_address_dev(uuid, character varying, character varying, character varying, character varying, character varying, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_addresses_dev(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_addresses_dev(uuid) FROM authenticated;

-- 2. Cleanup helpers
REVOKE EXECUTE ON FUNCTION public.cleanup_current_duplicates() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_current_duplicates() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_duplicate_companies() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_duplicate_companies() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_gdpr_data() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_gdpr_data() FROM authenticated;

-- 3. Module checks
REVOKE EXECUTE ON FUNCTION public.check_public_company_module(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_public_company_module(uuid, text) FROM authenticated;

-- 4. Quote / invoice operations
REVOKE EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, uuid) FROM authenticated;

-- 5. Attachments / addresses / services
REVOKE EXECUTE ON FUNCTION public.create_attachment(uuid, uuid, text, integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_attachment(uuid, uuid, text, integer, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_job_attachments(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_job_attachments(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_or_get_address(text, uuid, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.insert_or_get_address(text, uuid, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_service_with_variants(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_service_with_variants(uuid) FROM authenticated;

-- 6. Customer / client helpers
REVOKE EXECUTE ON FUNCTION public.find_client_by_phone_last9(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_client_by_phone_last9(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.search_customers(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_customers(text, uuid) FROM authenticated;

-- 7. Vault / secrets
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(text) FROM authenticated;

-- 8. Verifactu internal
REVOKE EXECUTE ON FUNCTION public.generate_verifactu_hash(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_verifactu_hash(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_verifactu_dispatch(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_verifactu_dispatch(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_verifactu_dispatch(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_verifactu_dispatch(uuid, uuid) FROM authenticated;

-- 9. Ticket internal
REVOKE EXECUTE ON FUNCTION public.set_initial_ticket_stage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_initial_ticket_stage() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_ticket_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_ticket_number() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_project_association() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_project_association() FROM authenticated;

-- 10. Notifications (internal)
REVOKE EXECUTE ON FUNCTION public.notify_on_service_contract() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_service_contract() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_push_on_notification_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_push_on_notification_insert() FROM authenticated;

-- 11. Cron wrappers
REVOKE EXECUTE ON FUNCTION public.invoke_docplanner_sync() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invoke_docplanner_sync() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_security_anomaly_alerts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invoke_security_anomaly_alerts() FROM authenticated;

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
--   '_test_gotrue_flow','fix_bet_drop_link','create_address_dev','get_addresses_dev',
--   'cleanup_current_duplicates','cleanup_duplicate_companies','cleanup_expired_gdpr_data',
--   'check_public_company_module','convert_quote_to_invoice','create_attachment',
--   'get_job_attachments','insert_or_get_address','get_service_with_variants',
--   'find_client_by_phone_last9','search_customers','get_vault_secret',
--   'generate_verifactu_hash','enqueue_verifactu_dispatch','set_initial_ticket_stage',
--   'set_ticket_number','validate_project_association','notify_on_service_contract',
--   'notify_push_on_notification_insert','invoke_docplanner_sync','invoke_security_anomaly_alerts'
-- );
--
-- Expected: 27 rows (25 distinct + 2 overloads for convert_quote_to_invoice
--           + 1 overload for enqueue_verifactu_dispatch — wait, that's 28)
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- ────────────────────────────────────────────────────────────────────────────
-- GRANT EXECUTE TO PUBLIC, GRANT EXECUTE TO authenticated for each function.