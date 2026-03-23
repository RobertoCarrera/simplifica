-- Restrict UPDATE on clients to owner/admin roles only.
-- Previously any company member could update any client record.
-- This migration drops the permissive UPDATE policy and replaces it
-- with one that checks the user's role via company_members.

-- Drop existing permissive UPDATE policy (name may vary; use IF EXISTS)
DO $$
BEGIN
  -- Try known policy names
  BEGIN
    DROP POLICY IF EXISTS "Users can update clients in their company" ON public.clients;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    DROP POLICY IF EXISTS "clients_update_own_company" ON public.clients;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END$$;

-- Create role-restricted UPDATE policy
CREATE POLICY "clients_update_by_admin_or_owner"
  ON public.clients
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = clients.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = clients.company_id
        AND cm.status = 'active'
        AND cm.role IN ('owner', 'admin', 'super_admin')
    )
  );
