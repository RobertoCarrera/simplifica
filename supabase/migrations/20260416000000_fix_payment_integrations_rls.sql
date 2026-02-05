-- Fix Critical RLS Leak in payment_integrations
-- Previous policies allowed any admin of any company to view integrations of all companies.
-- This migration restricts access to only members (owner/admin) of the specific company.

-- Drop insecure policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Create secure policies using company_members

-- SELECT
CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
    AND cm.company_id = payment_integrations.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
);

-- INSERT
CREATE POLICY "payment_integrations_insert" ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
    AND cm.company_id = payment_integrations.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
);

-- UPDATE
CREATE POLICY "payment_integrations_update" ON public.payment_integrations
FOR UPDATE TO authenticated
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

-- DELETE
CREATE POLICY "payment_integrations_delete" ON public.payment_integrations
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
    AND cm.company_id = payment_integrations.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
);
