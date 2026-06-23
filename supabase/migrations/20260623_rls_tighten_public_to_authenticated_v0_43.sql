-- Rafter v0.43 RLS hardening (Batch B)
-- Date: 2026-06-23
-- Source: docs/rafter-v43-rls-rescan.md (audit 2026-06-23)
--
-- Tightens {public} policies -> {authenticated} on policies whose
-- USING/WITH_CHECK uses auth.uid() directly OR SECURITY DEFINER
-- helpers that authorize via auth.uid() internally:
--   is_company_admin, is_company_member, is_company_owner,
--   is_super_admin_real, is_super_admin_by_internal_id,
--   get_user_company_id, get_my_user_id, get_my_company_ids,
--   get_auth_user_company_id, get_auth_user_professional_id,
--   my_company_id, current_user_is_admin, current_user_role,
--   mail_account_company_admin
--
-- These policies are functionally fail-closed for anon (helpers
-- return NULL/false when auth.uid() IS NULL), so the change is
-- consistency-only with v0.20/v0.39 direction.
--
-- Left untouched (LOW exceptions):
--   3 cron-managed policies with auth.role() = 'service_role':
--     scheduled_jobs_service_all, scheduled_jobs_write,
--     verifactu_events_service_all
--   3 reference-data policies with qual = true:
--     filter_definitions_select, localities_read_all,
--     sidebar_navigation_order_select
--
-- Companion migration: 20260623_rls_force_v0_43.sql (FORCE RLS
-- on all 200 public tables - applied in same v0.43 batch but
-- separate file because the FORCE RLS is idempotent and the
-- policy tightening is not).

BEGIN;

DO $$
DECLARE
  pol record;
  using_clause text;
  with_check_clause text;
  cmd_lower text;
  tightened_count int := 0;
BEGIN
  FOR pol IN
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text = '{public}'
      AND (qual::text ILIKE '%auth.uid()%'
           OR with_check::text ILIKE '%auth.uid()%'
           OR qual::text ~* 'is_company|is_admin|is_member|is_owner|current_user_is|matches_user|matches_company'
           OR with_check::text ~* 'is_company|is_admin|is_member|is_owner|current_user_is|matches_user|matches_company')
      AND policyname NOT IN (
        'scheduled_jobs_service_all',
        'scheduled_jobs_write',
        'verifactu_events_service_all',
        'filter_definitions_select',
        'localities_read_all',
        'sidebar_navigation_order_select'
      )
    ORDER BY tablename, policyname
  LOOP
    cmd_lower := lower(pol.cmd);
    using_clause := COALESCE(pol.qual, 'true');
    with_check_clause := COALESCE(pol.with_check, 'true');

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);

    IF cmd_lower = 'all' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
        pol.policyname, pol.tablename, using_clause, with_check_clause);
    ELSIF cmd_lower = 'select' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
        pol.policyname, pol.tablename, using_clause);
    ELSIF cmd_lower = 'insert' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
        pol.policyname, pol.tablename, with_check_clause);
    ELSIF cmd_lower = 'update' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
        pol.policyname, pol.tablename, using_clause, with_check_clause);
    ELSIF cmd_lower = 'delete' THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
        pol.policyname, pol.tablename, using_clause);
    ELSE
      RAISE EXCEPTION 'Unknown cmd: %', pol.cmd;
    END IF;

    tightened_count := tightened_count + 1;
  END LOOP;

  RAISE NOTICE 'Tightened % policies from {public} to {authenticated}', tightened_count;
END $$;

-- Verify: count of remaining {public}+auth.uid() policies (should be 0)
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM pg_policies
  WHERE schemaname = 'public'
    AND roles::text = '{public}'
    AND (qual::text ILIKE '%auth.uid()%'
         OR with_check::text ILIKE '%auth.uid()%'
         OR qual::text ~* 'is_company|is_admin|is_member|is_owner|current_user_is|matches_user|matches_company');
  IF remaining > 0 THEN
    RAISE WARNING 'Still % {public}+auth.uid() policies remaining', remaining;
  ELSE
    RAISE NOTICE 'OK: 0 {public}+auth.uid() policies remaining';
  END IF;
END $$;

COMMIT;
