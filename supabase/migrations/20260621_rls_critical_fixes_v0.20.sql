-- Migration: rls_critical_fixes_v0.20
-- Sprint: Rafter v0.20 (RLS deep audit fixes F-01 to F-04)
-- Date: 2026-06-21
--
-- Fixes 4 CRITICAL RLS policy gaps from Rafter deep audit 2026-06-21.
-- Audit: docs/rafter-v19-rls-deep-audit.md
--
-- Each fix preserves legitimate flows; only removes exploitable holes.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- F-01: ticket_comments cross-tenant injection
-- ──────────────────────────────────────────────────────────────────────────
-- Audit recommendation:
--   Drop "Users can insert comments for their company" (trusts user-supplied
--   company_id without verifying ticket ownership -> cross-tenant injection).
--   Replace the existing "Comments insert by company members" with a strict
--   version that verifies ticket.company_id = comment.company_id.

DROP POLICY "Users can insert comments for their company" ON public.ticket_comments;
DROP POLICY "Comments insert by company members" ON public.ticket_comments;
CREATE POLICY "Comments insert by company members"
  ON public.ticket_comments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_comments.ticket_id
        AND t.company_id = ticket_comments.company_id)
    AND EXISTS (SELECT 1 FROM public.company_members cm
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = ticket_comments.company_id
        AND cm.status = 'active')
  );

-- ──────────────────────────────────────────────────────────────────────────
-- F-02: pending_users admin bypass via {public}
-- ──────────────────────────────────────────────────────────────────────────
-- Audit recommendation:
--   DROP pending_users_access (company_id IS NULL branch leaks all
--   pre-onboarding records to anon + authenticated traffic).
--   Replace with auth_user_id-scoped SELECT + auth.uid()-gated INSERT.
--   supabase_auth_admin policy is kept untouched (separate, role-scoped).

DROP POLICY pending_users_access ON public.pending_users;
CREATE POLICY pending_users_self_select ON public.pending_users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
CREATE POLICY pending_users_self_insert ON public.pending_users
  FOR INSERT TO authenticated, anon
  WITH CHECK (
    auth_user_id IS NULL                     -- truly new signup
    OR auth_user_id = auth.uid()
  );
-- Keep supabase_auth_admin unrestricted
-- Service-role writes must use service_role bypass (not this policy)

-- ──────────────────────────────────────────────────────────────────────────
-- F-03: invoices super-admin locked out
-- ──────────────────────────────────────────────────────────────────────────
-- Audit recommendation:
--   Replace inverted (NOT is_super_admin_real()) predicates with explicit
--   is_super_admin_real() OR ... pattern. Restores global admin visibility.

DROP POLICY invoices_select_policy ON public.invoices;
CREATE POLICY invoices_select_policy ON public.invoices
  FOR SELECT TO authenticated
  USING (
    is_super_admin_real()
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = invoices.created_by AND u.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM company_members cm JOIN app_roles ar ON ar.id = cm.role_id
               WHERE cm.user_id = auth.uid()
                 AND cm.company_id = invoices.company_id
                 AND cm.status = 'active'
                 AND ar.name = ANY (ARRAY['owner','admin','supervisor']))
    OR EXISTS (SELECT 1 FROM client_assignments ca
               WHERE ca.client_id = invoices.client_id
                 AND ca.company_member_id IN (
                   SELECT cm.id FROM company_members cm
                   JOIN app_roles ar ON ar.id = cm.role_id
                   WHERE cm.user_id = auth.uid()
                     AND ar.name = ANY (ARRAY['owner','admin','supervisor'])))
  );

-- ──────────────────────────────────────────────────────────────────────────
-- F-04: gdpr_audit_log JWT claim COALESCE bypass
-- ──────────────────────────────────────────────────────────────────────────
-- Audit recommendation:
--   DROP "Company members can view client access history" ({public} +
--   COALESCE(request.jwt.claim.company_id, professionals.company_id) trusts
--   JWT claim first; if Auth Hook is ever misconfigured the entire GDPR
--   audit trail is exposed).
--   Admin reads remain covered by the existing gdpr_audit_log_admin_access
--   policy (is_dpo OR supervisor/admin/super_admin/owner role gate).
--   service_role bypasses RLS by default — no explicit INSERT policy needed.

DROP POLICY "Company members can view client access history" ON public.gdpr_audit_log;

COMMIT;
