-- ============================================================================
-- Migration: Restrict anon EXECUTE on crypto and verifactu RPCs
-- ============================================================================
-- Security fix (Rafter v0.3 audit): 11 functions with SECURITY DEFINER
-- and no auth.uid()/company_id check could be invoked by anon (no login)
-- users via PostgREST RPC. Several allow crypto operations on arbitrary
-- ciphertext and verifactu (AEAT invoicing) manipulation without any
-- ownership check.
--
-- IMPORTANT: REVOKE FROM anon, authenticated is required (not just PUBLIC).
-- Explicit grants to anon/authenticated are NOT removed by REVOKE FROM
-- PUBLIC. Both must be revoked.
--
-- After this migration:
--   - Only service_role and postgres can invoke these functions directly.
--   - The application must use Edge Functions (which run as service_role)
--     to call crypto/verifactu operations on behalf of users.
--   - Triggers (handle_verifactu_voiding, trigger_encrypt_booking_form_responses)
--     keep their grants because they are invoked by trigger machinery,
--     not via RPC.
-- ============================================================================

-- Crypto RPCs (REVOKE FROM anon + authenticated + PUBLIC for safety)
REVOKE EXECUTE ON FUNCTION public.decrypt_text(text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrypt_text(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.encrypt_text(text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_text(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.decrypt_booking_form_response(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrypt_booking_form_response(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.encrypt_booking_form_response(text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_booking_form_response(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.decrypt_company_email_credential(bytea) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrypt_company_email_credential(bytea) TO service_role;

REVOKE EXECUTE ON FUNCTION public.encrypt_company_email_credential(text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.encrypt_company_email_credential(text) TO service_role;

-- Verifactu RPCs (AEAT invoicing) - both overloads of enqueue_verifactu_dispatch
REVOKE EXECUTE ON FUNCTION public.verifactu_preflight_issue(uuid, text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.verifactu_preflight_issue(uuid, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.verifactu_status(invoices) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.verifactu_status(invoices) TO service_role;

REVOKE EXECUTE ON FUNCTION public.enqueue_verifactu_dispatch(uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_verifactu_dispatch(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.enqueue_verifactu_dispatch(uuid, uuid) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_verifactu_dispatch(uuid, uuid) TO service_role;

-- Triggers (handle_verifactu_voiding, trigger_encrypt_booking_form_responses)
-- keep their grants because they are invoked by trigger machinery,
-- not via RPC.

COMMENT ON FUNCTION public.decrypt_company_email_credential IS
  'SECURITY DEFINER. service_role only. anon/authenticated EXECUTE revoked (Rafter v0.3 audit).';
COMMENT ON FUNCTION public.encrypt_company_email_credential IS
  'SECURITY DEFINER. service_role only. anon/authenticated EXECUTE revoked (Rafter v0.3 audit).';
COMMENT ON FUNCTION public.verifactu_preflight_issue IS
  'SECURITY DEFINER. service_role only. anon/authenticated EXECUTE revoked (Rafter v0.3 audit).';
COMMENT ON FUNCTION public.enqueue_verifactu_dispatch IS
  'SECURITY DEFINER. service_role only. anon/authenticated EXECUTE revoked (Rafter v0.3 audit).';