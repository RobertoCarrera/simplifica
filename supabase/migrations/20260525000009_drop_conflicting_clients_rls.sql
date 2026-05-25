-- Drop old conflicting RLS policies on clients table then recreate clean wide policies.
-- The old policies (clients_update_policy, clients_delete_policy, etc.) were from earlier
-- migrations and were more restrictive (only owner/admin/super_admin).
-- The new policies (20260525000008) replaced the base ones but the old ones were still active,
-- and PostgreSQL RLS AND-logic requires ALL policies to pass — so the restrictive ones
-- overrode the permissive ones, blocking professional/member from UPDATE/DELETE.

DROP POLICY IF EXISTS "clients_update_policy" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_policy" ON public.clients;
DROP POLICY IF EXISTS "clients_select_policy" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_policy" ON public.clients;
DROP POLICY IF EXISTS "clients_select" ON public.clients;
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_update" ON public.clients;
DROP POLICY IF EXISTS "clients_delete" ON public.clients;

-- Recreate clean, wide policies (staff roles: owner, admin, super_admin, professional, member, agent, developer)
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
