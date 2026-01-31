-- Fix Critical RLS Leak in payment_integrations
-- Prior risk: Admins could access payment integrations of ALL companies.
-- Fix: Enforce company_id check via company_members.

-- 1. Ensure helper function exists to map auth.uid() to public.users.id
CREATE OR REPLACE FUNCTION public.get_my_public_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid();
$$;

-- 2. Drop insecure policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- 3. Create secure policies using company_members
-- Restrict access to active owners and admins of the specific company.

CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
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
    WHERE cm.user_id = public.get_my_public_id()
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
    WHERE cm.user_id = public.get_my_public_id()
    AND cm.company_id = payment_integrations.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = public.get_my_public_id()
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
    WHERE cm.user_id = public.get_my_public_id()
    AND cm.company_id = payment_integrations.company_id
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  )
);
