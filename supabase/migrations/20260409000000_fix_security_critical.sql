-- Migration: 20260409000000_fix_security_critical.sql
-- Description: Fixes critical RLS vulnerabilities in payment_integrations (Cross-Tenant) and incorrect ID usage in other tables.

-- 1. FIX PAYMENT_INTEGRATIONS RLS (Cross-Tenant Leak)
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
  )
);

-- 2. FIX APP_SETTINGS RLS (Incorrect ID usage: u.id vs u.auth_user_id)
DROP POLICY IF EXISTS "app_settings_write" ON public.app_settings;

CREATE POLICY "app_settings_write" ON public.app_settings
FOR ALL TO public
USING (
  (auth.role() = 'service_role'::text) OR
  (EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() -- Fixed from u.id
    AND ar.name IN ('admin', 'owner', 'super_admin')
  ))
)
WITH CHECK (
  (auth.role() = 'service_role'::text) OR
  (EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() -- Fixed from u.id
    AND ar.name IN ('admin', 'owner', 'super_admin')
  ))
);

-- 3. FIX CLIENT_VARIANT_ASSIGNMENTS RLS (Incorrect ID usage)
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.client_variant_assignments;

CREATE POLICY "Admins can manage assignments" ON public.client_variant_assignments FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() -- Fixed from u.id
    AND ar.name IN ('admin', 'super_admin')
  )
);
