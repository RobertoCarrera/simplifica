-- Fix Critical RLS Leak in payment_integrations
-- Previously, policies allowed any admin of ANY company to access ALL payment integrations.
-- This migration restricts access to only the company members with 'owner' or 'admin' roles.

-- Drop insecure policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;

-- Create secure policies using company_members
CREATE POLICY "payment_integrations_select_secure" ON public.payment_integrations
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

CREATE POLICY "payment_integrations_insert_secure" ON public.payment_integrations
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

CREATE POLICY "payment_integrations_update_secure" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_delete_secure" ON public.payment_integrations
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
