-- Migration: Fix clients_select policy to support cross-company access for supervisor/super_admin
--
-- PROBLEM: The policy used u.company_id = clients.company_id, but a super_admin's
-- users.company_id is set to their own company (Simplifica). When they switch to
-- CAIBS via company_members, their users.company_id is still Simplifica, so
-- the policy filter blocks access to CAIBS clients.
--
-- FIX: Use company_members table (which tracks multi-company membership) instead of
-- users.company_id. This is the same pattern used by clients_delete and clients_update.
-- The session's currentCompanyId() (sent via app state) determines which company to scope to,
-- and the membership row validates the user has the right role in that company.

BEGIN;

-- Drop and recreate the policy using company_members join
DROP POLICY IF EXISTS "clients_select" ON public.clients;

CREATE POLICY "clients_select" ON public.clients
  FOR SELECT TO authenticated
  USING (
    -- Access via active company membership (works for owner/admin/supervisor/super_admin)
    EXISTS (
      SELECT 1
      FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = clients.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin','member','agent','developer'])
    )
    OR is_client_assigned_to_user(id)
  );

COMMIT;
