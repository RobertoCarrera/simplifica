-- ============================================================================
-- Migration: invoices_rls_exclude_super_admin
--
-- Prevents the public.invoices RLS policy from granting access to users whose
-- `users.app_role_id` points to the platform-level `super_admin` role.
--
-- Why (RGPD / privacy):
--   The previous policy `invoices_select_policy` allowed the `company_members`
--   branch to match when the company_role was any of
--   {owner, admin, supervisor, super_admin}. A user with a platform-level
--   `super_admin` app_role who also had a `supervisor` membership on a
--   customer company (e.g. Roberto, who is super_admin in Simplifica and
--   supervisor in CAIBS) could therefore view CAIBS invoices — not because
--   the customer granted them access, but because the platform role leaked
--   into the company-level access check.
--
--   That violates RGPD / data-minimization: a platform admin should only see
--   customer data when explicitly granted an operational role (supervisor /
--   owner / admin) on the customer company. The `app_role = super_admin`
--   should NOT grant implicit access to invoices, regardless of company_role.
--
-- Resolution:
--   Rewrite `invoices_select_policy` to:
--     1. Exclude users where `is_super_admin_real() = true` from the
--        company_member branch (the platform role is not a bypass).
--     2. Restrict the company_role list to operational roles only
--        (owner, admin, supervisor) — drop `super_admin` from the list.
--
--   The other 3 SELECT policies on invoices are NOT bypass paths for the
--   superadmin and remain unchanged:
--     * `Clients can view own invoices`        — client portal, auth_user_id
--     * `clients_can_view_own_invoices`        — client portal, auth_user_id
--     * `invoices_professional_select`         — professional + assignment
--
--   Also unchanged: the `created_by` branch inside `invoices_select_policy`
--   (a user can always see invoices they themselves created).
--
-- Pre-conditions (already in the DB, not modified here):
--   * public.is_super_admin_real() function
--   * public.invoices table
--   * existing SELECT policies listed above
-- ============================================================================

DROP POLICY IF EXISTS "invoices_select_policy" ON public.invoices;

CREATE POLICY "invoices_select_policy"
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    -- Branch 1: the user themselves created the invoice.
    -- This is the user's own data and is not a superadmin bypass.
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = invoices.created_by
        AND u.auth_user_id = auth.uid()
    )
    OR
    -- Branch 2: the user has an OPERATIONAL company_role in the invoice's
    -- company (owner / admin / supervisor). The platform-level `super_admin`
    -- app_role is explicitly excluded via `is_super_admin_real() = false`,
    -- so a platform admin who also happens to be supervisor in a customer
    -- company does NOT inherit invoice access from the platform role.
    (
      NOT public.is_super_admin_real()
      AND EXISTS (
        SELECT 1
        FROM public.company_members cm
        JOIN public.app_roles ar ON ar.id = cm.role_id
        WHERE cm.user_id = auth.uid()
          AND cm.company_id = invoices.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['owner'::text, 'admin'::text, 'supervisor'::text])
      )
    )
    OR
    -- Branch 3: the user is a professional assigned to the invoice's client
    -- via client_assignments. Same RGPD rule: super_admin app_role is
    -- excluded so the platform role doesn't leak into operational access.
    (
      NOT public.is_super_admin_real()
      AND EXISTS (
        SELECT 1
        FROM public.client_assignments ca
        WHERE ca.client_id = invoices.client_id
          AND ca.company_member_id IN (
            SELECT cm.id
            FROM public.company_members cm
            JOIN public.app_roles ar ON ar.id = cm.role_id
            WHERE cm.user_id = auth.uid()
              AND ar.name = ANY (ARRAY['owner'::text, 'admin'::text, 'supervisor'::text])
          )
      )
    )
  );

COMMENT ON POLICY "invoices_select_policy" ON public.invoices IS
  'RGPD / privacy: platform-level super_admin app_role is explicitly EXCLUDED. A user with app_role=super_admin can only see invoices if they have an OPERATIONAL company_role (owner/admin/supervisor) on the invoice''s company AND their app_role is not super_admin. The created_by branch (the user themselves created the invoice) is preserved.';

NOTIFY pgrst, 'reload schema';
