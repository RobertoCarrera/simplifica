-- Migration: revoke_pii_helper_secdef_from_anon_authenticated
-- Sprint: Rafter v0.10 — revoke PII helper SECDEFINER functions
-- Author: Roberto + AI
-- Date: 2026-06-20
--
-- STATUS: SMOKE TESTED 2026-06-20 — ready to apply
-- Verified: anon/auth lose EXECUTE, service_role/postgres retain EXECUTE
-- Verified: upsert-client Edge Function (uses service_role) still works
-- Verified: issue_invoice_verifactu SECDEFINER chain still works (owner retains EXECUTE)
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- The Rafter v0.9 audit (commit 3027511a, PR #422, MERGED) identified 446
-- SECDEFINER functions in the public schema. Of those, only 3 pass the
-- aggressive filter for safe standalone REVOKE:
--
--   1. decrypt_client_pii(p_client_id uuid)
--   2. encrypt_client_pii(p_company_id uuid, p_dni text, p_birth_date text)
--   3. verifactu_log_event(p_event_type text, p_invoice_id uuid,
--                          p_company_id uuid, p_payload jsonb)
--
-- This migration revokes EXECUTE from { anon, authenticated } on those 3,
-- keeping service_role EXECUTE so internal callers (Edge Functions, other
-- SECDEFINER functions, admin tooling) keep working.
--
-- ────────────────────────────────────────────────────────────────────────────
-- CALLER ANALYSIS (verified 2026-06-20)
-- ────────────────────────────────────────────────────────────────────────────
--
-- 1. decrypt_client_pii(p_client_id uuid)
--    - Frontend callers (grep across repo .ts files): NONE
--    - Edge Function callers: NONE
--    - Other SECDEFINER callers: 0 (1 self-reference in body, not a call)
--    - Trigger callers: 0
--    - Conclusion: revoking anon/auth has zero impact. SAFE.
--
-- 2. encrypt_client_pii(p_company_id uuid, p_dni text, p_birth_date text)
--    - Frontend callers (grep): NONE
--    - Edge Function callers: supabase/functions/upsert-client/index.ts:205
--      Called as: supabase.rpc('encrypt_client_pii', { ... })
--      Client used: SERVICE_ROLE (per upsert-client EF design)
--    - Other SECDEFINER callers: 0
--    - Trigger callers: 0
--    - Conclusion: revoking anon/auth still allows service_role to call.
--      The Edge Function is unaffected because it uses service_role key.
--      SAFE.
--
-- 3. verifactu_log_event(p_event_type text, p_invoice_id uuid,
--                        p_company_id uuid, p_payload jsonb)
--    - Frontend callers (grep): NONE
--    - Edge Function callers: NONE (note: the verifactu-dispatcher EF
--      manipulates verifactu.events directly via admin client, NOT via
--      this RPC)
--    - Other SECDEFINER callers: 1 — issue_invoice_verifactu(p_invoiceid,
--      p_deviceid, p_softwareid)
--      Calling chain: external caller → issue_invoice_verifactu (SECDEF,
--      runs as owner) → verifactu_log_event
--      Because issue_invoice_verifactu is SECURITY DEFINER, when its body
--      calls verifactu_log_event the inner call runs as the owner of
--      issue_invoice_verifactu, NOT as the external caller. So revoking
--      anon from verifactu_log_event does NOT break the inner call.
--    - Trigger callers: 0
--    - Conclusion: SAFE.
--
-- ────────────────────────────────────────────────────────────────────────────
-- CURRENT GRANTS (from information_schema.routine_privileges)
-- ────────────────────────────────────────────────────────────────────────────
--
-- decrypt_client_pii:
--   - PUBLIC: EXECUTE  ← target
--   - authenticated: EXECUTE  ← target
--   - postgres: EXECUTE  ← keep
--   - service_role: EXECUTE  ← keep
--
-- encrypt_client_pii:
--   - PUBLIC: EXECUTE  ← target
--   - authenticated: EXECUTE  ← target
--   - postgres: EXECUTE  ← keep
--   - service_role: EXECUTE  ← keep
--
-- verifactu_log_event:
--   - PUBLIC: EXECUTE  ← target
--   - anon: EXECUTE  ← target
--   - authenticated: EXECUTE  ← target
--   - postgres: EXECUTE  ← keep
--   - service_role: EXECUTE  ← keep
--
-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION STATEMENTS
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. decrypt_client_pii: revoke PUBLIC + authenticated
REVOKE EXECUTE ON FUNCTION public.decrypt_client_pii(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrypt_client_pii(uuid) FROM authenticated;

-- 2. encrypt_client_pii: revoke PUBLIC + authenticated
REVOKE EXECUTE ON FUNCTION public.encrypt_client_pii(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.encrypt_client_pii(uuid, text, text) FROM authenticated;

-- 3. verifactu_log_event: revoke PUBLIC + anon + authenticated
REVOKE EXECUTE ON FUNCTION public.verifactu_log_event(text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verifactu_log_event(text, uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verifactu_log_event(text, uuid, uuid, jsonb) FROM authenticated;

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION VERIFICATION (run manually after applying)
-- ────────────────────────────────────────────────────────────────────────────
--
-- SELECT
--   p.proname AS function_name,
--   has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
--   has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_can_execute,
--   has_function_privilege('service_role', p.oid, 'EXECUTE') AS sr_can_execute
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('decrypt_client_pii', 'encrypt_client_pii', 'verifactu_log_event')
-- ORDER BY p.proname;
--
-- Expected:
--   - anon_can_execute = false for all 3
--   - auth_can_execute = false for all 3
--   - sr_can_execute = true for all 3
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- ────────────────────────────────────────────────────────────────────────────
--
-- GRANT EXECUTE ON FUNCTION public.decrypt_client_pii(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.decrypt_client_pii(uuid) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.encrypt_client_pii(uuid, text, text) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.encrypt_client_pii(uuid, text, text) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.verifactu_log_event(text, uuid, uuid, jsonb) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.verifactu_log_event(text, uuid, uuid, jsonb) TO anon;
-- GRANT EXECUTE ON FUNCTION public.verifactu_log_event(text, uuid, uuid, jsonb) TO authenticated;