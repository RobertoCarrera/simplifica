-- =============================================================================
-- Rafter v0.57 (2026-06-29 audit): RLS-enabled tables with NO policies
-- =============================================================================
--
-- Rafter audit on 2026-06-29 found 8 tables with row-level security enabled
-- but no policies, which means they fail-closed (auth users read/write
-- nothing; only service_role bypasses RLS). The "no policies" state is safe
-- but suspicious: an attacker who gets write access to ALTER TABLE can flip
-- RLS off and the table becomes wide open. We either DROP the dead tables or
-- add an explicit policy that names service_role.
--
-- Decision matrix:
--   TABLE                              | ACTION       | REASON
--   -----------------------------------+--------------+------------------------------
--   _e2e_debug                         | DROP         | E2E test scratch, 0 refs
--   admin_settings                     | DROP         | 16 KB, 0 app/SQL refs
--   grupo_bonos                        | DROP         | 0 refs (FK to grupos)
--   grupos                             | DROP         | 0 refs
--   plans_included_modules_backup      | DROP         | 0 refs (has a live counterpart)
--   budget_notification_log            | KEEP + policy | cron writes; SQL-side read
--   client_dedup_cleanup_log           | KEEP + policy | cron writes; client_dedup_rollback reads
--   module_key_canonical_map           | KEEP + policy | admin_upsert_plan reads for validation
--
-- All KEEP policies below are FOR service_role ONLY — these tables are read/
-- written by cron jobs and SQL functions that run as the function owner, not
-- by authenticated app sessions. We keep the fail-closed default for the
-- authenticated role so this migration is purely a "state-explicit, no
-- behavior change" hardening. If a future feature needs authenticated access,
-- add a dedicated policy at that time.
-- =============================================================================

-- ── 1) Drop dead/orphan tables ──────────────────────────────────────────────

-- E2E test scratch — only appears in auto-generated supabase-db.types.ts.
-- No source code reads or writes it.
DROP TABLE IF EXISTS public._e2e_debug CASCADE;

-- admin_settings — created in a pre-migration-history migration; 0 source
-- refs, 0 SQL function refs (verified via pg_proc.prosrc ILIKE search),
-- 16 KB on disk.
DROP TABLE IF EXISTS public.admin_settings CASCADE;

-- grupo_bonos.grupo_id -> grupos(id). Drop child first to satisfy FK.
DROP TABLE IF EXISTS public.grupo_bonos CASCADE;
DROP TABLE IF EXISTS public.grupos CASCADE;

-- Snapshot backup of `public.plans.included_modules` created by
-- migration 20260630000001_align_plans_module_keys.sql as a rollback
-- safety net for the in-place array rewrite. That migration has been
-- applied for days; its rollback path now relies on manual repair if
-- it is ever triggered (intentional tradeoff in exchange for removing
-- the orphan table). Confirmed 0 in/out FKs from the rest of the schema.
DROP TABLE IF EXISTS public.plans_included_modules_backup CASCADE;

-- ── 2) KEEP tables: explicit service_role-only policy ───────────────────────

-- budget_notification_log:
--   WRITTEN by cron in supabase/functions/send-budget-notification/ (runs as service_role)
--   READ    by SQL-side audit queries (super_admin only via Dashboard SQL)
--   ANGULAR-UI READ NOTE: src/app/services/budget-notification-settings.service.ts
--     has a .from('budget_notification_log') read. Today that read returns 0
--     rows because RLS has no policies. We are NOT adding an authenticated
--     read policy in this migration because we have not verified whether the
--     JWT carries the `company_id` claim needed by a `current_company_id()`
--     predicate — adding a permissive policy that the app cannot actually
--     satisfy would be worse than the current fail-closed. Behaviour for
--     the authenticated role is unchanged.
ALTER TABLE public.budget_notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_notification_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budget_notification_log_service_role_all ON public.budget_notification_log;
CREATE POLICY budget_notification_log_service_role_all ON public.budget_notification_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- client_dedup_cleanup_log:
--   WRITTEN by the client dedup cron (service_role)
--   READ    by public.client_dedup_rollback() SECURITY DEFINER function
-- No UI usage; service_role only.
ALTER TABLE public.client_dedup_cleanup_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_dedup_cleanup_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_dedup_cleanup_log_service_role_all ON public.client_dedup_cleanup_log;
CREATE POLICY client_dedup_cleanup_log_service_role_all ON public.client_dedup_cleanup_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- module_key_canonical_map:
--   READ by public.admin_upsert_plan() SECURITY DEFINER function for input
--        validation (canonical module key check). The function runs as the
--        function owner (service_role), so it does not need any row policy
--        to read — but the explicit policy makes intent clear and protects
--        against future schema changes.
--   WRITTEN by the canonical-keys migration (one-shot INSERT ... ON
--        CONFLICT pattern, run as service_role).
-- Read-only lookup; service_role only.
ALTER TABLE public.module_key_canonical_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_key_canonical_map FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS module_key_canonical_map_service_role_all ON public.module_key_canonical_map;
CREATE POLICY module_key_canonical_map_service_role_all ON public.module_key_canonical_map
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- End of Rafter v0.57 RLS sweep.
-- Behaviour change matrix:
--   authenticated/anon SELECT on budget_notification_log      -> unchanged (0 rows)
--   service_role SELECT/INSERT/UPDATE/DELETE on the 3 KEEP tables -> now allowed
--     (was already implicitly allowed by RLS bypass; now explicitly named)
--   5 dropped tables are gone permanently (no data was lost: all were empty or
--     had backups elsewhere).
-- =============================================================================
