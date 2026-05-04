-- Fix clients RLS: add policies for authenticated users (owner/admin/super_admin)
--
-- Problem: RLS is enabled on clients table but NO policies exist.
-- This causes 42501 errors on INSERT/SELECT/UPDATE/DELETE for all authenticated users.
--
-- The createAndLinkClient function in booking-settings.component.ts fails because
-- it cannot INSERT into clients without a matching policy.
--
-- Edge Functions using SERVICE_ROLE_KEY bypass RLS entirely (expected behavior).

-- SELECT: authenticated user (owner/admin/super_admin) can view clients in their company
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = clients.company_id
  )
);

-- INSERT: authenticated user (owner/admin/super_admin) can create clients in their company
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = clients.company_id
  )
);

-- UPDATE: authenticated user (owner/admin/super_admin) can update clients in their company
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = clients.company_id
  )
);

-- DELETE: authenticated user (owner/admin/super_admin) can delete clients in their company
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = clients.company_id
  )
);
