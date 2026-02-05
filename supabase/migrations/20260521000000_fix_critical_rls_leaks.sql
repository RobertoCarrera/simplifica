-- Migration: Fix Critical RLS Leaks in Payment Integrations and Domains
-- Date: 2026-05-21
-- Description:
-- 1. Restricts payment_integrations access to admins of the SAME company.
-- 2. Restricts domains management to admins of the SAME company as the domain owner.

-- ==============================================================================
-- 1. Payment Integrations Fix
-- ==============================================================================

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);

-- ==============================================================================
-- 2. Domains Fix
-- ==============================================================================

DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;
DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.domains;

-- Policy: Admins can manage domains owned by users in their company
CREATE POLICY "Admins can manage company domains" ON public.domains FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users admin_u
    LEFT JOIN public.app_roles ar ON admin_u.app_role_id = ar.id
    JOIN public.users owner_u ON owner_u.auth_user_id = domains.assigned_to_user
    WHERE admin_u.auth_user_id = auth.uid()
    AND admin_u.company_id = owner_u.company_id
    AND ar.name IN ('admin', 'owner', 'super_admin')
    AND admin_u.deleted_at IS NULL
  )
);

-- Policy: Authenticated users can view:
-- 1. Their own domains
-- 2. Verified domains of their own company (if they are admin)
CREATE POLICY "Authenticated users can view verified domains" ON public.domains FOR SELECT TO authenticated
USING (
  (assigned_to_user = auth.uid()) OR
  (
    is_verified = true AND EXISTS (
        SELECT 1
        FROM public.users admin_u
        LEFT JOIN public.app_roles ar ON admin_u.app_role_id = ar.id
        JOIN public.users owner_u ON owner_u.auth_user_id = domains.assigned_to_user
        WHERE admin_u.auth_user_id = auth.uid()
        AND admin_u.company_id = owner_u.company_id
        AND ar.name IN ('admin', 'owner', 'super_admin')
    )
  )
);
