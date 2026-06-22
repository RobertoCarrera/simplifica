-- Migration: rls_v0_39_remaining_fixes
-- Sprint: Rafter v0.39 (RLS MEDIUM leftovers)
-- Date: 2026-06-22
--
-- Final batch of RLS MEDIUM fixes from the Rafter deep audit 2026-06-21.
-- F-01..F-09 (CRITICAL/HIGH/MEDIUM) were fixed in v0.20.
-- This migration addresses the remaining 3 MEDIUM items:
--   1. localities {public} role + auth.role()='authenticated' pattern
--   2. get_my_public_id() policies missing auth.uid() IS NOT NULL guard
--   3. client_assignments {public} policies (defense-in-depth)
--
-- Audit: docs/rafter-v19-rls-deep-audit.md

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- Fix 1: localities {public} role exceptions
-- ──────────────────────────────────────────────────────────────────────────
-- The policies localities_update_authenticated (UPDATE) and
-- localities_write_authenticated (INSERT) have roles={public} + a USING/WITH
-- CHECK of `auth.role() = 'authenticated'`. Functionally safe today
-- (auth.role() gates by role), but the {public} + auth.role() pattern is
-- Pattern A flagged by the audit. Tighten to TO authenticated and drop the
-- redundant auth.role() check (role is now implied by the policy grant).
--
-- localities_read_all stays {public} (documented exception in v0.20 F-09:
-- municipality/postal-code autocomplete data, no PII).

DROP POLICY IF EXISTS "localities_update_authenticated" ON public.localities;
CREATE POLICY "localities_update_authenticated" ON public.localities
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "localities_write_authenticated" ON public.localities;
CREATE POLICY "localities_write_authenticated" ON public.localities
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- Fix 2 + Fix 3: get_my_public_id() sweep
-- ──────────────────────────────────────────────────────────────────────────
-- get_my_public_id() is SECURITY DEFINER and runs:
--   SELECT id FROM public.users WHERE auth_user_id = auth.uid();
--
-- If a `users` row with auth_user_id IS NULL is ever introduced (backfill,
-- data import, broken migration), the function's `WHERE auth_user_id = auth.uid()`
-- could match that row and return its id, causing policies like
-- `cm.user_id = get_my_public_id()` to match company_members belonging to
-- the NULL-auth row instead of the calling user.
--
-- Fix: wrap every policy using get_my_public_id() with an explicit
-- `auth.uid() IS NOT NULL` guard. Redundant for role=authenticated today
-- (auth.uid() is guaranteed non-null), but defense-in-depth: makes the
-- dependency explicit and survives future helper rewrites or role changes.
--
-- Side benefit (Fix 3): any policy still on {public} (client_assignments
-- has 3, company_members has 1) gets tightened to {authenticated} by the
-- same sweep, since get_my_public_id() policies should never grant to anon.

DO $gmpi$
DECLARE
  pol record;
  v_qual text;
  v_with_check text;
  v_cmd text;
  v_was_public boolean;
BEGIN
  FOR pol IN
    SELECT p.tablename, p.policyname, p.cmd, p.qual, p.with_check, p.roles::text AS roles_text
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND (p.qual::text ILIKE '%get_my_public_id%' OR p.with_check::text ILIKE '%get_my_public_id%')
  LOOP
    v_cmd := pol.cmd;
    v_was_public := (pol.roles_text = '{public}');

    -- Wrap USING in auth.uid() IS NOT NULL guard (defense-in-depth)
    IF pol.qual IS NOT NULL THEN
      v_qual := format('(auth.uid() IS NOT NULL AND %s)', pol.qual::text);
    ELSE
      v_qual := 'auth.uid() IS NOT NULL';
    END IF;

    -- Wrap WITH CHECK in auth.uid() IS NOT NULL guard
    IF pol.with_check IS NOT NULL THEN
      v_with_check := format('(auth.uid() IS NOT NULL AND %s)', pol.with_check::text);
    ELSE
      v_with_check := 'auth.uid() IS NOT NULL';
    END IF;

    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);

    IF v_cmd = 'ALL' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
        pol.policyname, pol.tablename, v_qual, v_with_check);
    ELSIF v_cmd = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
        pol.policyname, pol.tablename, v_qual);
    ELSIF v_cmd = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
        pol.policyname, pol.tablename, v_with_check);
    ELSIF v_cmd = 'UPDATE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
        pol.policyname, pol.tablename, v_qual, v_with_check);
    ELSIF v_cmd = 'DELETE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
        pol.policyname, pol.tablename, v_qual);
    END IF;
  END LOOP;
END
$gmpi$;

COMMIT;
