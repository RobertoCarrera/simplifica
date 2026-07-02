-- ============================================================
-- Rafter ops v0.59 part 3: tighten FORCE RLS + drop dead functions
-- Multi-tenant audit 2026-06-29 follow-up.
--
-- Context:
--   v0.57 (CRITICAL): cross-tenant RLS bypass in company_members
--   v0.58 part 1-2 (HIGH): storage + RLS data leaks
--   v0.59 part 1 (HIGH): realtime tickets + storage INSERT/UPDATE
--   v0.59 part 2 (HIGH): missing EXECUTE grants on count_orphan_invoices + verifactu_status
--   v0.59 part 3 (this file, MEDIUM/LOW): FORCE RLS gap + dead code
-- ============================================================

-- ============================================================
-- A. FORCE RLS on tables that have RLS enabled but not forced.
-- Without FORCE, the table owner (postgres) bypasses RLS.
-- service_role has BYPASSRLS at the role level, but the postgres
-- role used for migrations and admin scripts bypasses via the
-- table owner attribute. FORCE RLS removes the owner-bypass path.
-- ============================================================

DO $$
DECLARE
  table_name text;
  forced_count int := 0;
BEGIN
  FOR table_name IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    forced_count := forced_count + 1;
  END LOOP;
  RAISE NOTICE 'FORCE RLS applied to % tables', forced_count;
END $$;

-- ============================================================
-- B. Dead/stub functions: drop with evidence.
--
-- Verification protocol applied to each candidate:
--   1. pg_depend (internal deps: triggers, constraints, views)
--   2. pg_trigger (trigger function bindings)
--   3. Source code grep (.ts/.html/.js/.cjs across src/)
--   4. Edge function grep (supabase/functions/)
--   5. SQL migration grep (supabase/migrations/)
--   6. has_function_privilege for authenticated/anon
-- A function is dropped only if all six checks return zero/empty
-- or the body is an explicit placeholder stub.
-- ============================================================

-- B.1 Stub overload: explicit placeholder body, never called.
-- The 1-arg overload upsert_client(payload jsonb) is the live
-- implementation used by supabase-customers.service.ts:1150.
DROP FUNCTION IF EXISTS public.upsert_client(p_id uuid, p_data jsonb);

-- B.2 Unused since the 2026-06-20 grants audit revoked EXECUTE from
-- authenticated. Zero callers in source code, pg_depend, pg_trigger,
-- SQL migrations, edge functions. Last referenced only in revocation
-- comments inside 20260620_revoke_mail_crm_secdef*.sql.
DROP FUNCTION IF EXISTS public.accept_company_invitation_admin(p_invitation_token text, p_auth_user_id uuid);

-- B.3 Unused: REVOKE-only references in the 2026-06-20 audit.
-- No callers anywhere; only mentioned in grant-revoke pair comments.
DROP FUNCTION IF EXISTS public.check_gdpr_compliance();

-- B.4 Unused: three overloads, all only referenced in
-- 20260620_revoke_analytics_secdef_from_anon_authenticated.sql
-- comments. None are called from application code, edge functions,
-- or pg_depend.
DROP FUNCTION IF EXISTS public.f_mail_get_threads(p_account_id uuid, p_folder_name text, p_limit integer, p_offset integer);
DROP FUNCTION IF EXISTS public.f_mail_get_threads(p_account_id uuid, p_folder_role text, p_limit integer, p_offset integer, p_search text);
DROP FUNCTION IF EXISTS public.f_mail_get_threads(p_account_id uuid, p_folder_id uuid, p_limit integer, p_offset integer, p_search text);

-- B.5 Unused: only mentioned in 20260620_revoke_authenticated_standalone_secdef.sql
-- (REVOKE pair). No callers anywhere.
DROP FUNCTION IF EXISTS public.portal_withdraw_my_consent(p_consent_type text, p_evidence jsonb);

-- ============================================================
-- C. View review: zero non-postgres-owned views in public.
-- All views owned by postgres; RLS on underlying tables propagates
-- to view access under standard (non-SECURITY DEFINER) invocation.
-- No view was found with SECURITY DEFINER + missing company_id filter.
-- No action needed.
-- ============================================================

-- ============================================================
-- D. Composite FKs (id, company_id): DOCUMENTED, NOT APPLIED.
--
-- Defense-in-depth hardening: foreign keys currently reference only
-- id, so a row's company_id is not validated at the FK level. RLS
-- already enforces tenant isolation at the query layer, so the risk
-- is low. Composite FKs require:
--   1. Backfill: every existing FK row must satisfy (id, company_id).
--   2. Maintenance window: long-running ALTER TABLE on large tables.
--   3. Application schema coordination (cross-tenant refs).
-- Tracked as a separate audit cycle. DO NOT apply without schedule.
-- ============================================================

COMMENT ON SCHEMA public IS
'Multi-tenant schema. RLS enabled AND forced on all tables (v0.43 + v0.59 part 3).
For composite FK hardening, see migration TODO list (next audit cycle).';
