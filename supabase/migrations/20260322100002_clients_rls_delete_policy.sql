-- Restrict DELETE on clients to owner/admin/super_admin roles only.
-- Without this policy, any authenticated company member could soft-delete clients.
-- Note: Edge function (remove-or-deactivate-client) performs soft-deletes via UPDATE,
--       but this policy guards against direct DELETE calls bypassing the edge function.

-- Drop any pre-existing permissive DELETE policy
DO $$
BEGIN
  BEGIN
    DROP POLICY IF EXISTS "Users can delete clients in their company" ON public.clients;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    DROP POLICY IF EXISTS "clients_delete_own_company" ON public.clients;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END$$;

-- Create role-restricted DELETE policy
CREATE POLICY "clients_delete_by_admin_or_owner"
  ON public.clients
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = clients.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin', 'super_admin')
    )
  );
