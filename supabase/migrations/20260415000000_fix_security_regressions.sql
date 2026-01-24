-- Migration: Fix security regressions in RLS policies (April 2026)
-- Description: Replaces insecure/deprecated policies on payment_integrations and verifactu_settings with strict company_members checks.

-- 1. Secure payment_integrations (Fix Cross-Tenant Leak)
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

-- 2. Secure verifactu_settings (Fix Deprecated User Column Dependency)
DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_insert_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_delete_policy" ON public.verifactu_settings;

CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "verifactu_settings_insert_policy" ON public.verifactu_settings FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "verifactu_settings_delete_policy" ON public.verifactu_settings FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = verifactu_settings.company_id
      AND cm.role = 'owner' -- Only owners can delete settings
      AND cm.status = 'active'
  )
);
