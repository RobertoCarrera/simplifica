-- Fix Critical RLS on payment_integrations
-- Previous state: TO public policies allowed unauthenticated access.
-- New state: Only active Company Owners and Admins can access.

-- Drop insecure policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Ensure RLS is enabled
ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;

-- Create strict policy for all operations
CREATE POLICY "payment_integrations_policy" ON public.payment_integrations
FOR ALL TO authenticated
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
