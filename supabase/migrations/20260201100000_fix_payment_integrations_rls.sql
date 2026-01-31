-- Fix Critical RLS on payment_integrations
-- Previous policies were TO public and lacked company_id correlation.

-- 1. Drop insecure policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- 2. Create secure policies
CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = payment_integrations.company_id
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);
