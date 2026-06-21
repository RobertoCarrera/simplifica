-- Migration: revoke_authenticated_standalone_secdef
-- Sprint: Rafter v0.13 (authenticated SECDEF REVOKE wave 1)
-- Author: Roberto + AI
-- Date: 2026-06-20

-- STATUS: SMOKE TESTED 2026-06-20 - ready to apply

-- BACKGROUND
-- Rafter linter reported 315 functions with authenticated_security_definer_function_executable.
-- Of those, 65 pg_proc rows (63 distinct names) have NO callers in:
--   - pg_trigger.tgfoid (function bindings)
--   - pg_policies.qual and pg_policies.with_check (RLS clauses)
--   - pg_views.definition
--   - pg_proc.prosrc (internal SECDEF chain)
--   - src/ (frontend .ts files)
--   - supabase/functions/ (Edge Functions)

-- After REVOKE, these functions can only be called by service_role or postgres.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.admin_assign_company_plan(p_company_id uuid, p_plan_id text, p_notes text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_assign_company_plan(p_company_id uuid, p_plan_id text, p_notes text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_company_modules(p_company_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_company_modules(p_company_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_company_module(p_company_id uuid, p_module_key text, p_status text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_company_module(p_company_id uuid, p_module_key text, p_status text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_addon(p_id text, p_name text, p_description text, p_icon text, p_price_cents integer, p_currency text, p_billing_period text, p_applies_to_plans text[], p_sort_order integer, p_is_active boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_addon(p_id text, p_name text, p_description text, p_icon text, p_price_cents integer, p_currency text, p_billing_period text, p_applies_to_plans text[], p_sort_order integer, p_is_active boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_user_id_from_token() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auth_user_id_from_token() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_clients_dni_encryption() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backfill_clients_dni_encryption() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_view_client(p_client_company_id uuid, p_client_auth_user_id uuid, p_client_created_by uuid, p_client_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_view_client(p_client_company_id uuid, p_client_auth_user_id uuid, p_client_created_by uuid, p_client_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_marketing_send(p_campaign_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_marketing_send(p_campaign_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.change_company_plan(p_company_id uuid, p_plan_id text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.change_company_plan(p_company_id uuid, p_plan_id text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.client_cancel_booking(p_booking_id uuid, p_reason text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_cancel_booking(p_booking_id uuid, p_reason text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.client_create_booking(p_company_id uuid, p_service_id uuid, p_start_time timestamp with time zone, p_end_time timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_create_booking(p_company_id uuid, p_service_id uuid, p_start_time timestamp with time zone, p_end_time timestamp with time zone) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.client_get_preferences() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_get_preferences() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.client_reschedule_booking(p_booking_id uuid, p_new_start_time timestamp with time zone, p_new_end_time timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_reschedule_booking(p_booking_id uuid, p_new_start_time timestamp with time zone, p_new_end_time timestamp with time zone) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.client_update_preferences(p_email_notifications boolean, p_sms_notifications boolean, p_marketing_accepted boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_update_preferences(p_email_notifications boolean, p_sms_notifications boolean, p_marketing_accepted boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.client_update_profile(p_full_name text, p_phone text, p_avatar_url text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.client_update_profile(p_full_name text, p_phone text, p_avatar_url text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.count_marketing_audience(p_campaign_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_marketing_audience(p_campaign_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.count_orphan_invoices() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_orphan_invoices() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_address_rpc(p_direccion text, p_locality_id uuid, p_numero text, p_piso text, p_puerta text, p_bloque text, p_escalera text, p_cod_postal text, p_provincia text, p_pais text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_address_rpc(p_direccion text, p_locality_id uuid, p_numero text, p_piso text, p_puerta text, p_bloque text, p_escalera text, p_cod_postal text, p_provincia text, p_pais text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_booking_clinical_note(p_booking_id uuid, p_content text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_booking_clinical_note(p_booking_id uuid, p_content text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_gdpr_access_request(p_subject_email text, p_request_type text, p_subject_name text, p_request_details jsonb, p_requesting_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_gdpr_access_request(p_subject_email text, p_request_type text, p_subject_name text, p_request_details jsonb, p_requesting_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_locality_rpc(p_name text, p_postal_code text, p_province text, p_country text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_locality_rpc(p_name text, p_postal_code text, p_province text, p_country text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.debug_admin_access() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debug_admin_access() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.debug_auth_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debug_auth_status() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_stage_safe_rpc(p_stage_id uuid, p_reassign_to uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_stage_safe_rpc(p_stage_id uuid, p_reassign_to uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.export_client_gdpr_data(p_client_id uuid, p_requesting_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.export_client_gdpr_data(p_client_id uuid, p_requesting_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_invoice_collection_status(p_start date, p_end date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_invoice_collection_status(p_start date, p_end date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_quote_cube(p_start date, p_end date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_quote_cube(p_start date, p_end date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.f_quote_top_items_monthly(p_start date, p_end date, p_limit integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_quote_top_items_monthly(p_start date, p_end date, p_limit integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_marketing_campaign(p_campaign_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_marketing_campaign(p_campaign_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_auto_assign_client_on_booking_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_auto_assign_client_on_booking_insert() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_is_variant_visible(p_variant_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_is_variant_visible(p_variant_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_auth_company_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_auth_company_id() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_client_consent_status(p_client_id uuid, p_requesting_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_client_consent_status(p_client_id uuid, p_requesting_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_marketing_audience(p_campaign_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_marketing_audience(p_campaign_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_client_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_client_ids() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_service_variant_company_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_service_variant_company_ids() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_provider_tokens(provider_name text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_provider_tokens(provider_name text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_resource_occupancy_for_company(p_company_id uuid, p_from timestamp with time zone, p_to timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_resource_occupancy_for_company(p_company_id uuid, p_from timestamp with time zone, p_to timestamp with time zone) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_visible_service_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_visible_service_ids() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_company_registration(p_auth_user_id uuid, p_email text, p_full_name text, p_company_name text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_company_registration(p_auth_user_id uuid, p_email text, p_full_name text, p_company_name text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invite_user_to_company_debug(user_email text, user_name text, user_role text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invite_user_to_company_debug(user_email text, user_name text, user_role text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_company_admin_or_supervisor(company_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_company_admin_or_supervisor(company_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.link_ticket_device(p_ticket_id uuid, p_device_id uuid, p_relation_type text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_ticket_device(p_ticket_id uuid, p_device_id uuid, p_relation_type text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.list_company_devices(p_company_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_company_devices(p_company_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(p_company_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(p_company_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_gdpr_audit(p_action_type text, p_table_name text, p_record_id uuid, p_subject_email text, p_purpose text, p_old_values jsonb, p_new_values jsonb, p_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_gdpr_audit(p_action_type text, p_table_name text, p_record_id uuid, p_subject_email text, p_purpose text, p_old_values jsonb, p_new_values jsonb, p_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_marketing_send(p_campaign_id uuid, p_subject_email text, p_status text, p_error text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_marketing_send(p_campaign_id uuid, p_subject_email text, p_status text, p_error text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_client_accessed(p_client_id uuid, p_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_client_accessed(p_client_id uuid, p_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_export_my_data() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.portal_export_my_data() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_submit_arco_request(p_request_type text, p_details jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.portal_submit_arco_request(p_request_type text, p_details jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_submit_arco_request(p_request_type text, p_details jsonb, p_ip_address text, p_user_agent text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.portal_submit_arco_request(p_request_type text, p_details jsonb, p_ip_address text, p_user_agent text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_withdraw_my_consent(p_consent_type text, p_evidence jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.portal_withdraw_my_consent(p_consent_type text, p_evidence jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.process_gdpr_deletion_request(p_request_id uuid, p_approve boolean, p_rejection_reason text, p_processing_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_gdpr_deletion_request(p_request_id uuid, p_approve boolean, p_rejection_reason text, p_processing_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.register_new_owner_from_invite(p_invitation_token text, p_company_name text, p_company_nif text, p_user_name text, p_user_surname text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_new_owner_from_invite(p_invitation_token text, p_company_name text, p_company_nif text, p_user_name text, p_user_surname text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_or_deactivate_client_rpc(p_client_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_or_deactivate_client_rpc(p_client_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reorder_stages(stage_ids uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorder_stages(stage_ids uuid[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rotate_clinical_notes_key(p_old_version smallint, p_new_version smallint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rotate_clinical_notes_key(p_old_version smallint, p_new_version smallint) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.storage_get_company_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.storage_get_company_id() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_client_profile() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_update_last_accessed() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_update_last_accessed() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_client_consent(p_client_id uuid, p_consent_type text, p_consent_given boolean, p_consent_method text, p_consent_evidence jsonb, p_updating_user_id uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_client_consent(p_client_id uuid, p_consent_type text, p_consent_given boolean, p_consent_method text, p_consent_evidence jsonb, p_updating_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_client_rpc(p_first_name text, p_last_name text, p_email text, p_phone text, p_address text, p_city text, p_fiscal_id text, p_client_id uuid, p_metadata jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_client_rpc(p_first_name text, p_last_name text, p_email text, p_phone text, p_address text, p_city text, p_fiscal_id text, p_client_id uuid, p_metadata jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_verifactu_settings(psoftware_code text, pissuer_nif text, pcert_pem text, pkey_pem text, pkey_passphrase text, penvironment text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_verifactu_settings(psoftware_code text, pissuer_nif text, pcert_pem text, pkey_pem text, pkey_passphrase text, penvironment text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_verifactu_settings(p_company_id uuid, p_software_code text, p_software_name text, p_software_version text, p_issuer_nif text, p_environment text, p_is_active boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_verifactu_settings(p_company_id uuid, p_software_code text, p_software_name text, p_software_version text, p_issuer_nif text, p_environment text, p_is_active boolean) FROM authenticated;

COMMIT;