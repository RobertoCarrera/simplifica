-- Migration: revoke_67_secdef_public_grant
-- Sprint: Rafter v0.17 (bulk SECDEF hardening — completion pass)
-- Date: 2026-06-21
--
-- Step 2 of bulk SECDEF revoke: 67 trigger functions had EXECUTE granted
-- to PUBLIC (the default for CREATE FUNCTION). Even after revoking from
-- authenticated and anon directly, those roles still inherit EXECUTE from
-- PUBLIC membership. This migration revokes the PUBLIC grant so the
-- earlier REVOKE statements actually take effect.
--
-- Only postgres (function owner) and service_role (explicit grant) keep
-- EXECUTE. Triggers still work because they run as the function owner.
--
-- Follows: supabase/migrations/20260621190000_revoke_217_secdef_anon.sql
--
-- Linter delta after both migrations:
--   authenticated_security_definer_function_executable: 247 -> 178 (-69)
--   anon_security_definer_function_executable:          405 -> 188 (-217)
--
REVOKE EXECUTE ON FUNCTION public.activate_recurring_service_on_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_assign_client_creator() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_create_availability_schedules_for_company() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_retention_before_delete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_auto_assign_client_on_booking_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_auto_assign_service_on_booking_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_auto_quote_on_client_assigned() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cancel_quote_on_booking_cancel() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_sync_booking_quote_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_audit_booking_clinical_notes_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_audit_booking_documents_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_audit_clients_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_audit_clinical_notes_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_audit_consent_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_audit_invoices_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gdpr_breach_created_notify() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_comment_notifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_gdpr_consent_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_global_audit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user_link() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_client_link() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_project_comment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_link() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_registration() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_project_auto_move() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_assignment_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_audit_log() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_auto_assignment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_comment_automation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_comment_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_critical_notification() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_first_response() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_notifications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_soft_delete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_state_transition() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_verifactu_voiding() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_booking_changes() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.maintain_ticket_opened_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_booking_notifier() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_holded_booking_confirmed() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_holded_booking_estimate() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_recurring_budget_created() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_on_service_contract() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_owner_on_gdpr_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_push_on_notification_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_session_created() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_gdpr_processing_activities() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_initial_ticket_stage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_ticket_number() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_gdpr_to_client_consent() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_auto_create_quote_on_booking() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_delete_booking_rejects_quote() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_fn_bookings_notify_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_generate_quote_on_booking_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_mail_account_create_folders() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_mark_quote_invoiced_on_invoice_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_session_close_to_invoice() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_sync_booking_to_invoice_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_sync_client_consent_cache() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_sync_invoice_to_booking_payment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_audit_access_requests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_audit_consent_records() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_encrypt_booking_form_responses() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_client_stats_on_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_mail_folder_unread_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_project_association() FROM PUBLIC;