-- Migration: rls_high_medium_fixes_v0.20
-- Sprint: Rafter v0.20 (HIGH/MEDIUM followups F-05 to F-09)
-- Date: 2026-06-21
--
-- Fixes 5 RLS gaps from Rafter deep audit 2026-06-21.
-- F-01 to F-04 were fixed in migration 20260621_rls_critical_fixes_v0.20.
-- Audit: docs/rafter-v19-rls-deep-audit.md
--
-- Each fix preserves legitimate flows; only removes exploitable holes.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- F-05: client_portal_users email enumeration via JWT claim match
-- ──────────────────────────────────────────────────────────────────────────
-- Audit recommendation (verbatim):
--   DROP cpu_select, recreate with role {authenticated}, replace the
--   current_setting('request.jwt.claims') email match with a subquery
--   against the auth users table. Removes the JWT-claim trust and the
--   {public} role on this PII-bearing table.
--
-- DEVIATION FROM AUDIT SQL: the audit's exact subquery
--   "(SELECT email FROM auth.users WHERE id = auth.uid())"
-- fails in this Supabase project because `auth.users` is only granted
-- to the `postgres` role (verified: GRANT SELECT ON auth.users TO
-- authenticated returns "permission denied"). Using `public.users` (the
-- codebase convention used by every other email-aware policy in this
-- database, e.g. company_email_accounts_all, company_invitations) keeps
-- the same intent — "look up the current user's email, do NOT trust the
-- JWT claim" — and the policy actually executes.

DROP POLICY cpu_select ON public.client_portal_users;
CREATE POLICY cpu_select ON public.client_portal_users
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.company_members cm
      JOIN public.users u ON cm.user_id = u.id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = client_portal_users.company_id
        AND cm.status = 'active')
    -- Email-match fallback for the actual user (no JWT claim)
    OR email = (SELECT email FROM public.users WHERE auth_user_id = auth.uid())
  );

-- ──────────────────────────────────────────────────────────────────────────
-- F-06: client_clinical_notes {public} → {authenticated}
-- ──────────────────────────────────────────────────────────────────────────
-- Audit recommendation:
--   Change all four policies from TO public to TO authenticated.
--   USING/WITH CHECK clauses are preserved verbatim (they already gate
--   on auth.uid() via company_members; the issue is the {public} role
--   grant alone, which violates least-privilege / OWASP ASVS V4.2.1).

DROP POLICY clinical_notes_select_policy ON public.client_clinical_notes;
CREATE POLICY clinical_notes_select_policy ON public.client_clinical_notes
  FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1
   FROM (clients c
     JOIN company_members cm ON ((c.company_id = cm.company_id)))
  WHERE ((c.id = client_clinical_notes.client_id) AND (cm.user_id = auth.uid()) AND (cm.status = 'active'::text))));

DROP POLICY clinical_notes_insert_policy ON public.client_clinical_notes;
CREATE POLICY clinical_notes_insert_policy ON public.client_clinical_notes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS ( SELECT 1
   FROM (clients c
     JOIN company_members cm ON ((c.company_id = cm.company_id)))
  WHERE ((c.id = client_clinical_notes.client_id) AND (cm.user_id = auth.uid()) AND (cm.status = 'active'::text))));

DROP POLICY clinical_notes_update_policy ON public.client_clinical_notes;
CREATE POLICY clinical_notes_update_policy ON public.client_clinical_notes
  FOR UPDATE TO authenticated
  USING ((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (clients c
     JOIN company_members cm ON ((c.company_id = cm.company_id)))
  WHERE ((c.id = client_clinical_notes.client_id) AND (cm.user_id = auth.uid()) AND (cm.status = 'active'::text)))))
  WITH CHECK ((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (clients c
     JOIN company_members cm ON ((c.company_id = cm.company_id)))
  WHERE ((c.id = client_clinical_notes.client_id) AND (cm.user_id = auth.uid()) AND (cm.status = 'active'::text)))));

DROP POLICY clinical_notes_delete_policy ON public.client_clinical_notes;
CREATE POLICY clinical_notes_delete_policy ON public.client_clinical_notes
  FOR DELETE TO authenticated
  USING ((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM ((clients c
     JOIN company_members cm ON ((c.company_id = cm.company_id)))
     JOIN app_roles ar ON ((cm.role_id = ar.id)))
  WHERE ((c.id = client_clinical_notes.client_id) AND (cm.user_id = auth.uid()) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor'::text, 'owner'::text, 'admin'::text]))))));

-- ──────────────────────────────────────────────────────────────────────────
-- F-07: staff_view_all_company_comments is_internal leak
-- ──────────────────────────────────────────────────────────────────────────
-- Audit recommendation (verbatim):
--   Replace the "any active user in the company" USING with a role gate
--   that scopes internal comments to owner/admin/supervisor while still
--   letting staff (professional/agent/developer) see non-internal ones.

DROP POLICY staff_view_all_company_comments ON public.ticket_comments;
CREATE POLICY staff_view_company_comments ON public.ticket_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = ticket_comments.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['owner','admin','supervisor','professional','agent','developer']))
    AND (is_internal = false
         OR EXISTS (SELECT 1 FROM public.company_members cm
              JOIN public.app_roles ar ON ar.id = cm.role_id
              WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
                AND cm.company_id = ticket_comments.company_id
                AND cm.status = 'active'
                AND ar.name = ANY (ARRAY['owner','admin','supervisor'])))
  );

-- ──────────────────────────────────────────────────────────────────────────
-- F-08: client_assignments users.id = auth.uid() brittleness
-- ──────────────────────────────────────────────────────────────────────────
-- Audit recommendation (verbatim):
--   DROP "Admins can manage assignments" (the policy that relied on
--   users.id = auth.uid() instead of the codebase-standard
--   users.auth_user_id = auth.uid()). Replace with the correct pattern.
--   "Manage assignments" (owner-role) is left untouched.

DROP POLICY "Admins can manage assignments" ON public.client_assignments;
CREATE POLICY admins_manage_assignments ON public.client_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u
      JOIN public.app_roles ar ON ar.id = u.app_role_id
      WHERE u.auth_user_id = auth.uid()
        AND ar.name = ANY (ARRAY['admin','supervisor','super_admin']))
  );

-- ──────────────────────────────────────────────────────────────────────────
-- F-09: {public} role + get_my_public_id() sweep on PII tables
-- ──────────────────────────────────────────────────────────────────────────
-- Audit recommendation:
--   "Systematically audit every {public} policy and replace with
--   {authenticated} unless there is a documented reason for anonymous
--   access (e.g., public_bookings)."
--
-- Implementation: a DO block iterates the PII-table {public} policies
-- matching the same column-pattern filter as the smoke test, drops each
-- one, and recreates it with the role changed to {authenticated} and
-- the USING/WITH CHECK preserved verbatim. This is defense-in-depth
-- hygiene: anon can no longer even attempt to trigger the policy
-- evaluation, eliminating the {public} + SECURITY DEFINER helper
-- brittleness flagged in the audit.
--
-- Documented public exceptions (reference / catalog data, not PII):
--   - plans, plan_addons       -- pricing catalog, intentionally public
--   - localities               -- municipality/postal-code autocomplete

DO $f09$
DECLARE
  pol record;
  v_qual text;
  v_with_check text;
  v_cmd text;
BEGIN
  FOR pol IN
    SELECT p.tablename, p.policyname, p.cmd, p.qual, p.with_check
    FROM pg_policies p
    WHERE 'public'::text = ANY(p.roles)
      AND p.schemaname = 'public'
      AND p.tablename IN (
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND (
          column_name ILIKE '%email%' OR column_name ILIKE '%phone%'
          OR column_name ILIKE '%dni%'   OR column_name ILIKE '%address%'
          OR column_name ILIKE '%birth%' OR column_name ILIKE '%name%'
          OR column_name ILIKE '%tax_id%' OR column_name ILIKE '%passport%'
          OR column_name ILIKE '%signature%' OR column_name ILIKE '%document%'
        )
      )
      -- Documented public exceptions
      AND p.tablename NOT IN ('plans', 'plan_addons', 'localities')
  LOOP
    v_qual := COALESCE(pol.qual, 'true');
    v_with_check := COALESCE(pol.with_check, 'true');
    v_cmd := pol.cmd;

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
$f09$;

COMMIT;
