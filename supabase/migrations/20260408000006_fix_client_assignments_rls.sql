-- Fix: RLS regression on client_assignments.
--
-- Only company OWNERS can manage (add/remove) team assignments on a client.
-- Regular professionals auto-get assigned when they create a client, but
-- cannot reassign clients to other professionals — that is an owner action.

DROP POLICY IF EXISTS "Manage assignments" ON public.client_assignments;

CREATE POLICY "Manage assignments"
  ON public.client_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.app_roles r ON r.id = cm.role_id
      WHERE cm.user_id = public.get_my_public_id()
        AND cm.status = 'active'
        AND r.name = 'owner'
        AND cm.company_id = (
          SELECT company_id FROM public.clients WHERE id = client_assignments.client_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.app_roles r ON r.id = cm.role_id
      WHERE cm.user_id = public.get_my_public_id()
        AND cm.status = 'active'
        AND r.name = 'owner'
        AND cm.company_id = (
          SELECT company_id FROM public.clients WHERE id = client_assignments.client_id
        )
    )
  );
