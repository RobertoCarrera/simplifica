-- Migration: revoke_issue_invoice_verifactu_secdef_from_anon_authenticated
-- Sprint: Rafter v0.10 (continuation of PR #425)
-- Author: Roberto + AI
-- Date: 2026-06-20
--
-- STATUS: SMOKE TESTED 2026-06-20 — ready to apply
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- PR #425 (Rafter v0.10, commit b5b9df2a) revoked 3 PII helper SECDEFINER
-- functions. This migration continues the same work for one more function
-- that was missed because it was not in the original "3 standalone" filter.
--
-- issue_invoice_verifactu(p_invoiceid uuid, p_deviceid text, p_softwareid text)
--
-- ────────────────────────────────────────────────────────────────────────────
-- CALLER ANALYSIS (verified 2026-06-20)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Frontend callers (grep across repo .ts files): NONE
--   - Only reference is in src/app/services/supabase-db.types.ts (auto-generated
--     type definitions)
-- Edge Function callers: NONE
-- Other SECDEFINER callers: 0 (verified via pg_proc body search)
-- Trigger callers: 0
--
-- IMPORTANT: this function INTERNALLY calls verifactu_log_event (verified in
-- PR #425 analysis). The chain is:
--
--   [external caller] → issue_invoice_verifactu (SECDEF, runs as owner)
--                       ↓
--                       verifactu_log_event (still callable by owner)
--
-- When anon/authenticated call issue_invoice_verifactu, its body runs as
-- the OWNER (postgres). The inner call to verifactu_log_event also runs as
-- that owner. After PR #425, anon/authenticated lost EXECUTE on
-- verifactu_log_event, but the owner (postgres) retains it. So the chain
-- keeps working.
--
-- After THIS migration: anon/authenticated also lose EXECUTE on
-- issue_invoice_verifactu itself, so the entry point is closed. The chain
-- can still be invoked via service_role (e.g. from internal admin tooling).
--
-- ────────────────────────────────────────────────────────────────────────────
-- CURRENT GRANTS
-- ────────────────────────────────────────────────────────────────────────────
--
-- issue_invoice_verifactu:
--   - anon: EXECUTE  ← target
--   - authenticated: EXECUTE  ← target
--   - postgres: EXECUTE  ← keep (SECDEFINER owner)
--   - service_role: EXECUTE  ← keep (admin tooling, internal callers)
--
-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION STATEMENTS
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

REVOKE EXECUTE ON FUNCTION public.issue_invoice_verifactu(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.issue_invoice_verifactu(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.issue_invoice_verifactu(uuid, text, text) FROM authenticated;

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
-- WHERE n.nspname = 'public' AND p.proname = 'issue_invoice_verifactu';
--
-- Expected: anon=false, auth=false, sr=true, pg=true
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- ────────────────────────────────────────────────────────────────────────────
--
-- GRANT EXECUTE ON FUNCTION public.issue_invoice_verifactu(uuid, text, text) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.issue_invoice_verifactu(uuid, text, text) TO anon;
-- GRANT EXECUTE ON FUNCTION public.issue_invoice_verifactu(uuid, text, text) TO authenticated;