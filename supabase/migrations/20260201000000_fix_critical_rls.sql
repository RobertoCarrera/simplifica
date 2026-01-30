-- Fix Critical RLS Issues: Secure payment_integrations and verifactu_settings
-- Migration ID: 20260201000000_fix_critical_rls.sql

-- 0. Ensure public.get_my_public_id() exists (Dependency)
-- Re-defining here to ensure migration is self-contained and avoids "function does not exist" errors.
CREATE OR REPLACE FUNCTION public.get_my_public_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_public_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_public_id() TO service_role;


-- 1. Secure payment_integrations
-- Previous Issue: Checked global admin role but not company membership, allowing cross-tenant access.

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
  )
);

-- 2. Secure verifactu_settings
-- Previous Issue: Policies were TO public. Changed to TO authenticated and enforced company_members check.

DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_insert_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_delete_policy" ON public.verifactu_settings;

CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "verifactu_settings_insert_policy" ON public.verifactu_settings
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role IN ('owner', 'admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "verifactu_settings_delete_policy" ON public.verifactu_settings
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role = 'owner'
  )
);
