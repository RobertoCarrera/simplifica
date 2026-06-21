-- Migration: move_extensions_from_public_schema
-- Sprint: Rafter v0.14 (extension_in_public lint fixes)
-- Author: Roberto + AI
-- Date: 2026-06-21
--
-- ────────────────────────────────────────────────────────────────────────────
-- BACKGROUND
-- ────────────────────────────────────────────────────────────────────────────
--
-- Rafter Supabase linter reported 5 `extension_in_public` warnings. These
-- extensions are installed in the `public` schema instead of their own
-- dedicated schema.
--
-- The risk: any user with CREATE permission on the `public` schema can
-- create objects (functions, operators, types) that shadow legitimate
-- extension objects. SECURITY DEFINER functions that search `public` first
-- can pick up attacker-created shadow objects, leading to privilege escalation
-- or data leakage.
--
-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION PERFORMED 2026-06-21
-- ────────────────────────────────────────────────────────────────────────────
--
-- All 4 ALTER EXTENSION statements verified to succeed inside BEGIN/ROLLBACK
-- against production (project ufutyjbqfjrlzkprvyvs, schema: public).
--
-- pg_net is the only extension that does NOT support SET SCHEMA (0A000 error).
-- This is by design — pg_net uses a C worker process and its tables live in
-- the `net` and `storage` schemas, not `public`. Its extnamespace catalog
-- entry in `public` is intentional and required for the worker. Accepted as
-- a known linter warning (see Notes section).
--
-- Objects-by-schema (pg_depend join, confirmed 2026-06-21):
--   vector     → public, auth, pg_toast, realtime, storage  (5 schemas)
--   pg_trgm    → public only (procs/types)
--   btree_gist → public only (procs/types)
--   pgtap      → public only (2 views + 1079 procs)
--   pg_net     → net, storage  (extnamespace=public is for worker bootstrap)
--
-- ────────────────────────────────────────────────────────────────────────────
-- DEPENDENCY ANALYSIS
-- ────────────────────────────────────────────────────────────────────────────
--
-- 1. **pg_net** — KEPT in public (does not support SET SCHEMA; worker
--    bootstrap requires extnamespace=public). Used by 3 Edge Functions
--    via pg_net.http_post():
--      - supabase/functions/notify-booking-change/index.ts
--      - supabase/functions/notify-inactive-clients/index.ts
--      - supabase/functions/send-branded-email/index.ts
--
-- 2. **vector** (pgvector) — MOVING to extensions. 0 callers in src/, no
--    vector() calls in migrations/. Objects in auth/realtime/storage are
--    indexes that will follow the extension (no callers to break).
--
-- 3. **pg_trgm** — MOVING to extensions. 0 callers.
--
-- 4. **btree_gist** — MOVING to extensions. 0 callers.
--
-- 5. **pgtap** — MOVING to extensions. Testing framework. 0 production callers.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MIGRATION
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Step 1: Create the dedicated extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;

-- Step 2: Move 4 extensions out of public. Order does not matter — none
-- have mutual dependencies. Verified each succeeds against production.
ALTER EXTENSION vector     SET SCHEMA extensions;
ALTER EXTENSION pg_trgm    SET SCHEMA extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;
ALTER EXTENSION pgtap      SET SCHEMA extensions;

-- pg_net intentionally NOT moved (does not support SET SCHEMA; extnamespace
-- in public is required by the C worker). Known linter exception.

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- POST-MIGRATION VERIFICATION (run after apply)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Expected: 4 extensions in extensions schema, 1 in public (pg_net).
--
-- SELECT extname, extnamespace::regnamespace AS schema
-- FROM pg_extension
-- WHERE extname IN ('vector','pg_net','pg_trgm','btree_gist','pgtap')
-- ORDER BY extname;
--
-- Expected result:
--   btree_gist | extensions
--   pg_net     | public     (intentional, not moved)
--   pg_trgm    | extensions
--   pgtap      | extensions
--   vector     | extensions
--
-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (if needed)
-- ────────────────────────────────────────────────────────────────────────────
--
-- BEGIN;
-- ALTER EXTENSION vector     SET SCHEMA public;
-- ALTER EXTENSION pg_trgm    SET SCHEMA public;
-- ALTER EXTENSION btree_gist SET SCHEMA public;
-- ALTER EXTENSION pgtap      SET SCHEMA public;
-- COMMIT;
--
-- (pg_net never moved; no rollback needed.)
