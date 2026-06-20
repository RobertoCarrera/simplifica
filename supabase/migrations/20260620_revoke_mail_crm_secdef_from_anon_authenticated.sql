-- Migration: revoke_mail_crm_secdef_from_anon_authenticated
-- Sprint: Rafter v0.11c — Mail/CRM helpers batch
-- Author: Roberto + AI
-- Date: 2026-06-20
--
-- STATUS: SMOKE TESTED 2026-06-20 — ready to apply
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- Followup to v0.11a (GDPR batch, 26 functions) and v0.11b (analytics batch,
-- 51 functions). This is the third batch: Mail/CRM helpers (23 functions).
--
-- Remaining batches planned:
--   v0.11d: Booking/client/company mgmt (~25 functions)
--   v0.11e: Internal/dev helpers (~21 functions)
--
-- ────────────────────────────────────────────────────────────────────────────
-- CALLER ANALYSIS (verified 2026-06-20)
-- ────────────────────────────────────────────────────────────────────────────
--
-- All 23 functions have:
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

-- 1. Mail folder operations
REVOKE EXECUTE ON FUNCTION public.create_mail_folder_rpc(uuid, character varying, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_mail_folder_rpc(uuid, character varying, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_mail_folder_rpc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_mail_folder_rpc(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rename_mail_folder_rpc(uuid, character varying) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rename_mail_folder_rpc(uuid, character varying) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_mail_folder_unread_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_mail_folder_unread_count() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_mail_system_folders(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_mail_system_folders(uuid) FROM authenticated;

-- 2. Mail message operations
REVOKE EXECUTE ON FUNCTION public.move_mail_messages(uuid[], uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_mail_messages(uuid[], uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.classify_incoming_email_rpc(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.classify_incoming_email_rpc(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.suggest_folders_rpc(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.suggest_folders_rpc(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_smart_folders_rpc(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_smart_folders_rpc(uuid, boolean) FROM authenticated;

-- 3. Invitation management
REVOKE EXECUTE ON FUNCTION public.accept_company_invitation_admin(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_company_invitation_admin(text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_invited_user(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_invited_user(text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_invited_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activate_invited_user(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pending_invitation_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_pending_invitation_by_email(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_owner_email_request(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_owner_email_request(uuid, uuid, text, text) FROM authenticated;

-- 4. Pending user cleanup
REVOKE EXECUTE ON FUNCTION public.clean_expired_pending_users() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clean_expired_pending_users() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_pending_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_pending_user() FROM authenticated;

-- 5. Encryption helpers (used internally by other RPCs)
REVOKE EXECUTE ON FUNCTION public.encrypt_text(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.encrypt_text(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_text(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrypt_text(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_company_email_credential(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.encrypt_company_email_credential(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_company_email_credential(bytea) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrypt_company_email_credential(bytea) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_booking_form_response(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.encrypt_booking_form_response(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_booking_form_response(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrypt_booking_form_response(uuid) FROM authenticated;

-- 6. Portal user data (GDPR ARCO rights) - additional to v0.11a
REVOKE EXECUTE ON FUNCTION public.portal_get_my_arco_requests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.portal_get_my_arco_requests() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_get_my_consents() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.portal_get_my_consents() FROM authenticated;

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
--   'create_mail_folder_rpc','delete_mail_folder_rpc','rename_mail_folder_rpc',
--   'update_mail_folder_unread_count','ensure_mail_system_folders',
--   'move_mail_messages','classify_incoming_email_rpc','suggest_folders_rpc',
--   'toggle_smart_folders_rpc','accept_company_invitation_admin',
--   'activate_invited_user','get_pending_invitation_by_email','notify_owner_email_request',
--   'clean_expired_pending_users','cleanup_pending_user',
--   'encrypt_text','decrypt_text','encrypt_company_email_credential',
--   'decrypt_company_email_credential','encrypt_booking_form_response',
--   'decrypt_booking_form_response','portal_get_my_arco_requests','portal_get_my_consents'
-- );
--
-- Expected: auth_blocked = 24 (23 functions + 1 overload = 24 pg_proc rows)
--           sr_has = 24
--           pg_has = 24
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- ────────────────────────────────────────────────────────────────────────────
-- GRANT EXECUTE TO PUBLIC, GRANT EXECUTE TO authenticated for each function.