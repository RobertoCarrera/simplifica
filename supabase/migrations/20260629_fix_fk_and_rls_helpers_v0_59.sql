-- ============================================================================
-- Rafter v0.59 part 2 — RLS helper GRANTs after multi-tenant audit 2026-06-29
-- ============================================================================
--
-- Three HIGH issues were reported by the 2026-06-29 multi-tenant audit. After
-- inspecting each function body and every caller in the codebase, the actual
-- remediations differ from the original audit hypotheses:
--
-- 1. notifications.recipient_id FK (to users.id) — FALSE POSITIVE
--    -----------------------------------------------------------------
--    All Edge Functions (check-completed-sessions, booking-public,
--    notify-session-created, notify-booking-change, send-daily-digest,
--    notify-breach-aepd, request-email-account, check-gdpr-deadlines)
--    consistently resolve professional_id → professionals.user_id BEFORE
--    inserting into notifications.recipient_id. The FK to users(id) is
--    correct as-is. v0.57 part 2 already fixed check-completed-sessions and
--    the rest of the codebase was already compliant.
--
--    No SQL change required. This migration documents the finding.
--
-- 2. count_orphan_invoices() — REAL BUG (function revoked from authenticated)
--    -----------------------------------------------------------------
--    Function body is safe:
--      - SECURITY DEFINER + search_path locked
--      - Resolves company_id from auth.uid() BEFORE reading invoices
--      - Returns 0 if no active user/company
--    The function was created with `GRANT EXECUTE ... TO authenticated`
--    (migration 20260618000003) but the wave-1 RLS hardening pass
--    (migration 20260620_revoke_authenticated_standalone_secdef.sql
--    lines 54-55) REVOKED it. The frontend has a client-side workaround
--    (invoice-list.component.ts L800-824) that filters by company_id
--    locally, but Roberto's logs still show "permission denied for function
--    count_orphan_invoices" — likely from a residual Angular service worker
--    cache, the SSR pre-render, or another consumer not yet migrated.
--
--    Re-granting to authenticated is SAFE: the function never returns any
--    cross-tenant data because the company_id filter runs before any
--    invoice lookup. It cannot leak data even if abused.
--
-- 3. get_my_user_id() — ALREADY GRANTED (audit was stale)
--    -----------------------------------------------------------------
--    Current state: authenticated has EXECUTE. The 4 RLS policies on
--    integrations / docplanner_sync_log / holded_integrations /
--    docplanner_integrations already work for end users. No SQL change
--    required; the GRANT below is idempotent defense-in-depth.
--
-- BONUS FINDING (higher impact than the 3 audited):
-- -----------------------------------------------------------------
--    verifactu_status(invoices) is used as a VIRTUAL COLUMN by PostgREST
--    (Postgres exposes any function matching (table_typ) as a selectable
--    column). The frontend reads inv.verifactu_status in 5+ places
--    (invoice-list.component.ts L684, 919, 948, 1096, 1130 and
--    invoice.model.ts L89). The function was REVOKED from authenticated in
--    migration 20260619_revoke_crypto_verifactu_anon.sql L46-47 because
--    it was misclassified as "trigger-internal".
--
--    Result: every authenticated SELECT from `invoices` that includes
--    `verifactu_status` fails with permission denied. This is the
--    silent killer behind Roberto's invoice-list 403s.
--
--    Function body is safe:
--      - SECURITY DEFINER + search_path locked to public, extensions, temp
--      - Returns a single text (status) keyed by invoice id
--      - No cross-tenant leak: status is per-invoice, and invoice RLS
--        already enforces company_id membership at the row level
--    Re-granting to authenticated is safe and restores the column.
--
-- ============================================================================

BEGIN;

-- Issue 2: count_orphan_invoices — restore authenticated access
REVOKE EXECUTE ON FUNCTION public.count_orphan_invoices() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_orphan_invoices() TO authenticated;

-- Issue 3: get_my_user_id — idempotent re-grant (already granted, kept for
-- defense-in-depth so future REVOKE waves don't silently break RLS policies).
-- Also tighten anon / PUBLIC grants to match the 20260620 hardening pattern.
REVOKE EXECUTE ON FUNCTION public.get_my_user_id() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_user_id() TO authenticated;

-- BONUS: verifactu_status — restore authenticated access so the virtual
-- column is selectable on invoices for end users. Already revoked from
-- anon in 20260619; we keep that and only grant to authenticated.
REVOKE EXECUTE ON FUNCTION public.verifactu_status(invoices) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.verifactu_status(invoices) TO authenticated;

COMMIT;

-- Post-deploy verification (run manually, do NOT include in CI):
--
--   SELECT has_function_privilege('authenticated', 'public.count_orphan_invoices()', 'EXECUTE');
--   SELECT has_function_privilege('authenticated', 'public.get_my_user_id()',     'EXECUTE');
--   SELECT has_function_privilege('authenticated', 'public.verifactu_status(invoices)', 'EXECUTE');
--
-- All three must return `true`.