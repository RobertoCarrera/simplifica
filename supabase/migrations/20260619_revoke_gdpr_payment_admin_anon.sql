-- ============================================================================
-- Migration: Restrict anon EXECUTE on GDPR, payment and admin RPCs (v0.4)
-- ============================================================================
-- Rafter v0.4 audit: 16+ SECURITY DEFINER functions were callable by anon
-- and authenticated users via PostgREST RPC. Several have high impact.
--
-- KEY LEARNING: REVOKE FROM PUBLIC alone does NOT remove grants that were
-- explicitly granted to anon or authenticated. You must REVOKE FROM
-- anon and authenticated explicitly.
--
-- After this migration, only service_role and postgres retain EXECUTE.
-- The app must invoke these via Edge Functions (which run as service_role).
-- ============================================================================

-- GDPR: data lifecycle manipulation (with overloads)
REVOKE EXECUTE ON FUNCTION public.anonymize_client_data(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.anonymize_client_data(uuid, text, uuid) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_mail_folder_rpc(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_consent_status(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_client_privacy_consent(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_client_consent(uuid, boolean, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_client_consent(uuid, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_retention_record(text, text) FROM anon, authenticated;

-- Payment: refunds, invoice manipulation
REVOKE EXECUTE ON FUNCTION public.cancel_booking_with_refund(integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_invoice_totals(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_next_invoice_number(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_invoice_before_issue(uuid) FROM anon, authenticated;

-- Admin: force operations on behalf of users
REVOKE EXECUTE ON FUNCTION public.admin_cancel_booking_force(integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_create_booking_for_user(integer, integer, timestamptz) FROM anon, authenticated;

-- Super admin introspection (with overloads)
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin_by_id(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin_by_internal_id(uuid) FROM anon, authenticated;

-- Grant to service_role (postgres already has it implicitly)
GRANT EXECUTE ON FUNCTION public.anonymize_client_data(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.anonymize_client_data(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_mail_folder_rpc(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_client_consent_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_client_privacy_consent(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_client_consent(uuid, boolean, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_client_consent(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_retention_record(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_with_refund(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_invoice_totals(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_next_invoice_number(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_invoice_before_issue(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking_force(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_booking_for_user(integer, integer, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin_by_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin_by_internal_id(uuid) TO service_role;

COMMENT ON FUNCTION public.anonymize_client_data IS
  'SECURITY DEFINER. service_role only. anon/authenticated EXECUTE revoked (Rafter v0.4 audit).';
COMMENT ON FUNCTION public.cancel_booking_with_refund IS
  'SECURITY DEFINER. service_role only. anon/authenticated EXECUTE revoked (Rafter v0.4 audit).';
COMMENT ON FUNCTION public.validate_invoice_before_issue IS
  'SECURITY DEFINER. service_role only. anon/authenticated EXECUTE revoked (Rafter v0.4 audit).';
COMMENT ON FUNCTION public.is_super_admin IS
  'SECURITY DEFINER. service_role only. anon/authenticated EXECUTE revoked (Rafter v0.4 audit).';
COMMENT ON FUNCTION public.is_super_admin_by_internal_id IS
  'SECURITY DEFINER. service_role only. anon/authenticated EXECUTE revoked (Rafter v0.4 audit).';