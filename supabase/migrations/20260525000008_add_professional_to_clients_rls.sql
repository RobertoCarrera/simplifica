-- Add professional role to clients RLS policies
-- Fix: professionals (and members) could not update/delete/select/insert clients
-- because the RLS policies only allowed owner, admin, super_admin.
-- Error: 500 "Failed to remove client" from remove-or-deactivate-client edge function.

-- Drop existing policies
DROP POLICY IF EXISTS "clients_select" ON public.clients;
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_update" ON public.clients;
DROP POLICY IF EXISTS "clients_delete" ON public.clients;

-- SELECT: authenticated staff users can view clients in their company
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin', 'professional', 'member', 'agent', 'developer')
      AND u.company_id = clients.company_id
  )
);

-- INSERT: authenticated staff users can create clients in their company
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin', 'professional', 'member', 'agent', 'developer')
      AND u.company_id = clients.company_id
  )
);

-- UPDATE: authenticated staff users can update clients in their company
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin', 'professional', 'member', 'agent', 'developer')
      AND u.company_id = clients.company_id
  )
);

-- DELETE: authenticated staff users can delete clients in their company
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin', 'professional', 'member', 'agent', 'developer')
      AND u.company_id = clients.company_id
  )
);
