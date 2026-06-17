-- Migration: TEMPORARY — allow 'professional' role to UPDATE public.clients
-- Date: 2026-06-17
-- Reason: User requested temporary relaxation of edit permissions for professionals
--         so they can edit client records from home. To be reverted in a follow-up
--         migration once the temporary window ends.
--
-- Scope: ONLY clients_update. Does NOT touch clients_insert, clients_delete,
--        clients_select, or any other policy. Conservative by design.
--
-- To REVERT: run the inverse migration (remove 'professional' from the ANY array).
--            See git log for the corresponding frontend revert commit.

DROP POLICY IF EXISTS clients_update ON public.clients;

CREATE POLICY clients_update ON public.clients
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM company_members cm
            JOIN users u ON u.id = cm.user_id
            JOIN app_roles ar ON ar.id = cm.role_id
            WHERE u.auth_user_id = auth.uid()
              AND cm.company_id = clients.company_id
              AND cm.status = 'active'
              AND ar.name = ANY (
                  ARRAY[
                      'owner',
                      'admin',
                      'supervisor',
                      'super_admin',
                      'professional'   -- TEMPORARY 2026-06-17
                  ]
              )
        )
        OR auth_user_id = auth.uid()  -- clients_update_own_record semantics preserved
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM company_members cm
            JOIN users u ON u.id = cm.user_id
            JOIN app_roles ar ON ar.id = cm.role_id
            WHERE u.auth_user_id = auth.uid()
              AND cm.company_id = clients.company_id
              AND cm.status = 'active'
              AND ar.name = ANY (
                  ARRAY[
                      'owner',
                      'admin',
                      'supervisor',
                      'super_admin',
                      'professional'   -- TEMPORARY 2026-06-17
                  ]
              )
        )
        OR auth_user_id = auth.uid()
    );
