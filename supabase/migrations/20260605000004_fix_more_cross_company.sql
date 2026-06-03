-- Migration: Fix additional cross-company patterns
-- Handles: (SELECT users.company_id FROM users WHERE users.auth_user_id = auth.uid())
-- and: JOIN ... ON u.company_id = c.company_id

BEGIN;

-- client_contacts: use company_members to get user's company
DROP POLICY IF EXISTS "Users can view contacts of their clients" ON public.client_contacts;
CREATE POLICY "Users can view contacts of their clients" ON public.client_contacts
  FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT clients.id FROM clients
      WHERE clients.company_id IN (
        SELECT cm.company_id FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS "Users can manage contacts of their clients" ON public.client_contacts;
CREATE POLICY "Users can manage contacts of their clients" ON public.client_contacts
  FOR ALL TO authenticated
  USING (
    client_id IN (
      SELECT clients.id FROM clients
      WHERE clients.company_id IN (
        SELECT cm.company_id FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
      )
    )
  );

-- client_variant_assignments: use company_members
DROP POLICY IF EXISTS "Company users can view client variant assignments" ON public.client_variant_assignments;
CREATE POLICY "Company users can view client variant assignments" ON public.client_variant_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN company_members cm ON cm.company_id = c.company_id
      JOIN users u ON u.id = cm.user_id
      WHERE c.id = client_variant_assignments.client_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Company users can manage client variant assignments" ON public.client_variant_assignments;
CREATE POLICY "Company users can manage client variant assignments" ON public.client_variant_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN company_members cm ON cm.company_id = c.company_id
      JOIN users u ON u.id = cm.user_id
      WHERE c.id = client_variant_assignments.client_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- attachments
DROP POLICY IF EXISTS "attachments_company_access" ON public.attachments;
CREATE POLICY "attachments_company_access" ON public.attachments
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
    ) AND deleted_at IS NULL
  );

-- ai_usage_logs (if exists)
DROP POLICY IF EXISTS "Users can view logs for their company" ON public.ai_usage_logs;
CREATE POLICY "Users can view logs for their company" ON public.ai_usage_logs
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
    )
  );

-- tickets_tags: use company_members
DROP POLICY IF EXISTS "staff_manage_tickets_tags" ON public.tickets_tags;
CREATE POLICY "staff_manage_tickets_tags" ON public.tickets_tags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tickets t
      JOIN company_members cm ON cm.company_id = t.company_id
      JOIN users u ON u.id = cm.user_id
      WHERE t.id = tickets_tags.ticket_id
        AND u.auth_user_id = auth.uid()
        AND u.active = true
        AND cm.status = 'active'
    )
  );

-- verifactu_settings: use company_members
DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE cm.company_id = verifactu_settings.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
        AND u.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE cm.company_id = verifactu_settings.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
        AND u.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "verifactu_settings_delete_policy" ON public.verifactu_settings;
CREATE POLICY "verifactu_settings_delete_policy" ON public.verifactu_settings
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE cm.company_id = verifactu_settings.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
        AND ar.name = 'owner'
        AND u.deleted_at IS NULL
    )
  );

-- verifactu_cert_history
DROP POLICY IF EXISTS "verifactu_cert_history_select_policy" ON public.verifactu_cert_history;
CREATE POLICY "verifactu_cert_history_select_policy" ON public.verifactu_cert_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE cm.company_id = verifactu_cert_history.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
        AND u.deleted_at IS NULL
    )
  );

-- ticket_comment_versions
DROP POLICY IF EXISTS "Staff can view comment versions" ON public.ticket_comment_versions;
CREATE POLICY "Staff can view comment versions" ON public.ticket_comment_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
        AND EXISTS (
          SELECT 1 FROM ticket_comments tc
          WHERE tc.id = ticket_comment_versions.comment_id
            AND tc.company_id = cm.company_id
        )
    )
  );

COMMIT;
