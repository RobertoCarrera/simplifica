-- Fix Security Audit Findings - Feb 2026

-- 1. FIX CRITICAL: payment_integrations RLS Leak (Cross-Tenant)
-- Previous policies failed to check company_id, allowing cross-company access.

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

-- 2. FIX MEDIUM: app_settings broken access (ID mismatch)
-- Was using u.id = auth.uid() instead of u.auth_user_id = auth.uid()

DROP POLICY IF EXISTS "app_settings_write" ON public.app_settings;

CREATE POLICY "app_settings_write" ON public.app_settings
FOR ALL TO public
USING (
  (auth.role() = 'service_role'::text) OR
  (EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() -- FIXED
      AND ar.name IN ('admin', 'owner', 'super_admin')
      AND u.deleted_at IS NULL
  ))
)
WITH CHECK (
  (auth.role() = 'service_role'::text) OR
  (EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() -- FIXED
      AND ar.name IN ('admin', 'owner', 'super_admin')
      AND u.deleted_at IS NULL
  ))
);

-- 3. FIX: client_variant_assignments broken access (ID mismatch)
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.client_variant_assignments;

CREATE POLICY "Admins can manage assignments" ON public.client_variant_assignments FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() -- FIXED
      AND ar.name IN ('admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);
