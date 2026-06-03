-- Migration: Fix cross-company access for supervisor/super_admin
-- Use company_members instead of users.company_id for filtering.
BEGIN;

-- ai_usage_logs.Users can view logs for their company (SELECT)
DROP POLICY IF EXISTS "Users can view logs for their company" ON public.ai_usage_logs;
CREATE POLICY "Users can view logs for their company" ON public.ai_usage_logs FOR SELECT TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- attachments.attachments_company_access (ALL)
DROP POLICY IF EXISTS "attachments_company_access" ON public.attachments;
CREATE POLICY "attachments_company_access" ON public.attachments FOR ALL TO authenticated
  USING (((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')) AND (deleted_at IS NULL)));

-- bookings.bookings_select (SELECT)
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;
CREATE POLICY "bookings_select" ON public.bookings FOR SELECT TO authenticated
  USING (((EXISTS (
        SELECT 1 FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN app_roles ar ON ar.id = cm.role_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = bookings.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin','member','agent','developer'])
      )) OR (professional_id = get_auth_user_professional_id())));

-- contracts.Company users can select all contracts for their company (SELECT)
DROP POLICY IF EXISTS "Company users can select all contracts for their company" ON public.contracts;
CREATE POLICY "Company users can select all contracts for their company" ON public.contracts FOR SELECT TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- contracts.Company users can update their own contracts (UPDATE)
DROP POLICY IF EXISTS "Company users can update their own contracts" ON public.contracts;
CREATE POLICY "Company users can update their own contracts" ON public.contracts FOR UPDATE TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')))
  WITH CHECK ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- contracts.Users can view contracts for their company (SELECT)
DROP POLICY IF EXISTS "Users can view contracts for their company" ON public.contracts;
CREATE POLICY "Users can view contracts for their company" ON public.contracts FOR SELECT TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- gdpr_access_requests.gdpr_access_requests_company (ALL)
DROP POLICY IF EXISTS "gdpr_access_requests_company" ON public.gdpr_access_requests;
CREATE POLICY "gdpr_access_requests_company" ON public.gdpr_access_requests FOR ALL TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- gdpr_consent_requests.gcr_company_policy (SELECT)
DROP POLICY IF EXISTS "gcr_company_policy" ON public.gdpr_consent_requests;
CREATE POLICY "gcr_company_policy" ON public.gdpr_consent_requests FOR SELECT TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- hidden_stages.Users can unhide generic stages for their company (DELETE)
DROP POLICY IF EXISTS "Users can unhide generic stages for their company" ON public.hidden_stages;
CREATE POLICY "Users can unhide generic stages for their company" ON public.hidden_stages FOR DELETE TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- hidden_stages.Users can view their company hidden stages (SELECT)
DROP POLICY IF EXISTS "Users can view their company hidden stages" ON public.hidden_stages;
CREATE POLICY "Users can view their company hidden stages" ON public.hidden_stages FOR SELECT TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- inbound_email_audit.Company Owners can view their company logs (SELECT)
DROP POLICY IF EXISTS "Company Owners can view their company logs" ON public.inbound_email_audit;
CREATE POLICY "Company Owners can view their company logs" ON public.inbound_email_audit FOR SELECT TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- rooms.Admins can manage own company rooms (ALL)
DROP POLICY IF EXISTS "Admins can manage own company rooms" ON public.rooms;
CREATE POLICY "Admins can manage own company rooms" ON public.rooms FOR ALL TO authenticated
  USING ((EXISTS (
        SELECT 1 FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN app_roles ar ON ar.id = cm.role_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = rooms.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['admin','owner','supervisor','super_admin'])
      )));

-- rooms.Users can view own company rooms (SELECT)
DROP POLICY IF EXISTS "Users can view own company rooms" ON public.rooms;
CREATE POLICY "Users can view own company rooms" ON public.rooms FOR SELECT TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- ticket_comments.Users can view comments for their company (SELECT)
DROP POLICY IF EXISTS "Users can view comments for their company" ON public.ticket_comments;
CREATE POLICY "Users can view comments for their company" ON public.ticket_comments FOR SELECT TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- ticket_stages.Users can delete company stages (DELETE)
DROP POLICY IF EXISTS "Users can delete company stages" ON public.ticket_stages;
CREATE POLICY "Users can delete company stages" ON public.ticket_stages FOR DELETE TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- ticket_stages.Users can update company stages (UPDATE)
DROP POLICY IF EXISTS "Users can update company stages" ON public.ticket_stages;
CREATE POLICY "Users can update company stages" ON public.ticket_stages FOR UPDATE TO authenticated
  USING ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')))
  WITH CHECK ((company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active')));

-- ticket_stages.Users can view generic or company stages (SELECT)
DROP POLICY IF EXISTS "Users can view generic or company stages" ON public.ticket_stages;
CREATE POLICY "Users can view generic or company stages" ON public.ticket_stages FOR SELECT TO authenticated
  USING (((company_id IS NULL) OR (company_id IN (SELECT cm.company_id FROM company_members cm JOIN users u ON u.id = cm.user_id WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'))));

-- verifactu_cert_history.verifactu_cert_history_select_policy (SELECT)
DROP POLICY IF EXISTS "verifactu_cert_history_select_policy" ON public.verifactu_cert_history;
CREATE POLICY "verifactu_cert_history_select_policy" ON public.verifactu_cert_history FOR SELECT TO authenticated
  USING ((EXISTS (
        SELECT 1 FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN app_roles ar ON ar.id = cm.role_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = verifactu_cert_history.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
      )));

-- verifactu_settings.verifactu_settings_select_policy (SELECT)
DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings FOR SELECT TO authenticated
  USING ((EXISTS (
        SELECT 1 FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN app_roles ar ON ar.id = cm.role_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = verifactu_settings.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
      )));

-- verifactu_settings.verifactu_settings_update_policy (UPDATE)
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings FOR UPDATE TO authenticated
  USING ((EXISTS (
        SELECT 1 FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN app_roles ar ON ar.id = cm.role_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = verifactu_settings.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
      )))
  WITH CHECK ((EXISTS (
        SELECT 1 FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN app_roles ar ON ar.id = cm.role_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = verifactu_settings.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
      )));

COMMIT;