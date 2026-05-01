-- Fix payment_integrations RLS: require authenticated role + JWT validation
-- 
-- Problem: TO public allows any request (including those without a JWT) to 
-- hit the policy. While the USING clause uses auth.uid(), we add explicit 
-- verification by switching to TO authenticated, ensuring only users with 
-- a valid JWT can access the table at all.
--
-- The USING/WITH CHECK clauses remain unchanged — they still enforce
-- company_id + role check via auth.uid() lookup.
--
-- Edge Functions using SERVICE_ROLE_KEY bypass RLS entirely (expected behavior).

-- Drop existing policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- SELECT: authenticated user (owner/admin/super_admin) in the same company
-- auth.uid() must be non-NULL (valid JWT), which TO authenticated guarantees
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
  )
);

-- INSERT: authenticated user (owner/admin/super_admin) in the same company
CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
  )
);

-- UPDATE: authenticated user (owner/admin/super_admin) in the same company
CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
  )
);

-- DELETE: authenticated user (owner/admin/super_admin) in the same company
CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
  )
);