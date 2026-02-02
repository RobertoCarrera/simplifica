-- Fix Critical RLS on payment_integrations
-- Previous policies did not filter by company_id, allowing cross-tenant access.

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Ensure RLS is enabled
ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);
