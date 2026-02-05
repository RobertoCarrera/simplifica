-- Fix critical RLS leaks in payment_integrations and domains
-- Risk: Admins of one company could access/manage resources of other companies.

-- 1. Fix Payment Integrations
-- Previous policies checked for admin role but missed company_id match

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
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.company_id = payment_integrations.company_id
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.company_id = payment_integrations.company_id
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.company_id = payment_integrations.company_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.company_id = payment_integrations.company_id
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.company_id = payment_integrations.company_id
  )
);

-- 2. Fix Domains
-- Previous policy allowed any admin to manage any domain regardless of company ownership via user assignment.

DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;

CREATE POLICY "Admins can manage all domains" ON public.domains FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users admin_u
    LEFT JOIN public.app_roles ar ON admin_u.app_role_id = ar.id
    -- Join domain owner to verify same company
    JOIN public.users target_u ON target_u.auth_user_id = domains.assigned_to_user
    WHERE admin_u.auth_user_id = auth.uid()
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND admin_u.company_id = target_u.company_id
  )
);
