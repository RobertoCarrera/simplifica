-- FIX CRITICAL SECURITY VULNERABILITY: Cross-Tenant Access in payment_integrations
-- The previous policies allowed any admin of ANY company to access payment integrations of ALL companies.
-- This migration restricts access to members of the SAME company with admin/owner privileges.

-- 1. DROP EXISTING INSECURE POLICIES
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- 2. CREATE SECURE POLICIES
-- Policy for SELECT
CREATE POLICY "payment_integrations_select_secure" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
      -- Access restricted to Owner or Admin roles
      AND (cm.role = 'owner' OR ar.name IN ('admin', 'owner', 'super_admin'))
  )
);

-- Policy for INSERT
CREATE POLICY "payment_integrations_insert_secure" ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
      AND (cm.role = 'owner' OR ar.name IN ('admin', 'owner', 'super_admin'))
  )
);

-- Policy for UPDATE
CREATE POLICY "payment_integrations_update_secure" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
      AND (cm.role = 'owner' OR ar.name IN ('admin', 'owner', 'super_admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
      AND (cm.role = 'owner' OR ar.name IN ('admin', 'owner', 'super_admin'))
  )
);

-- Policy for DELETE
CREATE POLICY "payment_integrations_delete_secure" ON public.payment_integrations
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
      AND (cm.role = 'owner' OR ar.name IN ('admin', 'owner', 'super_admin'))
  )
);
