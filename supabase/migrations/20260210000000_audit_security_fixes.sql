-- 20260210000000_audit_security_fixes.sql

-- SECURITY AUDIT REMEDIATION: STRICT RLS ENFORCEMENT
-- Objective: Fix identified gaps in multi-tenant isolation for configuration tables.
-- Date: 2026-02-10

-- 1. Enforce RLS on payment_integrations
-- Previously potentially exposed via permissive policies. Now strictly bound to company membership.
ALTER TABLE IF EXISTS public.payment_integrations ENABLE ROW LEVEL SECURITY;

-- Drop any potential existing permissive policies
DROP POLICY IF EXISTS "payment_integrations_isolation" ON public.payment_integrations;
DROP POLICY IF EXISTS "Enable all for users based on company_id" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_select_policy" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert_policy" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update_policy" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete_policy" ON public.payment_integrations;
DROP POLICY IF EXISTS "public_can_view_integrations" ON public.payment_integrations;

CREATE POLICY "payment_integrations_isolation" ON public.payment_integrations
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
  )
);

-- 2. Enforce RLS on verifactu_settings
-- Contains sensitive certificates and keys. Strict access required.
ALTER TABLE IF EXISTS public.verifactu_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "verifactu_settings_isolation" ON public.verifactu_settings;
DROP POLICY IF EXISTS "Enable all for users based on company_id" ON public.verifactu_settings;
DROP POLICY IF EXISTS "public_read_verifactu" ON public.verifactu_settings;

CREATE POLICY "verifactu_settings_isolation" ON public.verifactu_settings
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = verifactu_settings.company_id
      AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = verifactu_settings.company_id
      AND cm.status = 'active'
  )
);

-- 3. Reinforce Notifications Security
-- Ensure no inserts from public/authenticated users directly (must use system functions)
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.notifications;

-- 4. Ensure public.users cannot be enumerated by authenticated users (Recursion protection)
-- We use a dedicated function or exact ID match.
-- (Assuming existing policies on users are correct, but preventing broad selects is key)
-- No changes to 'users' table in this patch to avoid side effects, as it's central auth.
