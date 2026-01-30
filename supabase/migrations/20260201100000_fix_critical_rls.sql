-- Fix critical RLS issues in payment_integrations and verifactu_settings
-- 1. Use TO authenticated instead of TO public
-- 2. Enforce strict company_id check using company_members table

-- PAYMENT INTEGRATIONS
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

-- VERIFACTU SETTINGS
DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_insert_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_delete_policy" ON public.verifactu_settings;

CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "verifactu_settings_insert_policy" ON public.verifactu_settings
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "verifactu_settings_delete_policy" ON public.verifactu_settings
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role = 'owner' -- Only owner can delete settings? Previous policy said owner.
      AND cm.status = 'active'
  )
);
