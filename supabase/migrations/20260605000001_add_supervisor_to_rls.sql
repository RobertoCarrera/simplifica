-- Migration: Add supervisor role to all RLS policies
-- Supervisor = same access as owner/admin
BEGIN;

-- app_settings.app_settings_write
DROP POLICY IF EXISTS "app_settings_write" ON public.app_settings;
CREATE POLICY "app_settings_write" ON public.app_settings FOR ALL TO authenticated
  USING (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (ar.name = ANY (ARRAY['supervisor','admin'::text, 'owner'::text, 'super_admin'::text])))))))
  WITH CHECK (((auth.role() = 'service_role'::text) OR (EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (ar.name = ANY (ARRAY['supervisor','admin'::text, 'owner'::text, 'super_admin'::text])))))));

-- booking_clinical_notes.booking_clinical_notes_delete_policy
DROP POLICY IF EXISTS "booking_clinical_notes_delete_policy" ON public.booking_clinical_notes;
CREATE POLICY "booking_clinical_notes_delete_policy" ON public.booking_clinical_notes FOR DELETE TO authenticated
  USING (((created_by = ( SELECT users.id
   FROM users
  WHERE (users.auth_user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM (((bookings b
     JOIN clients c ON ((b.client_id = c.id)))
     JOIN company_members cm ON ((c.company_id = cm.company_id)))
     JOIN app_roles ar ON ((cm.role_id = ar.id)))
  WHERE ((b.id = booking_clinical_notes.booking_id) AND (cm.user_id = ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])))))));

-- booking_documents.booking_documents_delete_policy
DROP POLICY IF EXISTS "booking_documents_delete_policy" ON public.booking_documents;
CREATE POLICY "booking_documents_delete_policy" ON public.booking_documents FOR DELETE TO authenticated
  USING (((created_by = ( SELECT users.id
   FROM users
  WHERE (users.auth_user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM (((bookings b
     JOIN clients c ON ((b.client_id = c.id)))
     JOIN company_members cm ON ((c.company_id = cm.company_id)))
     JOIN app_roles ar ON ((cm.role_id = ar.id)))
  WHERE ((b.id = booking_documents.booking_id) AND (cm.user_id = ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])))))));

-- bookings.bookings_select
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;
CREATE POLICY "bookings_select" ON public.bookings FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (u.company_id = bookings.company_id) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text, 'member'::text, 'agent'::text, 'developer'::text]))))) OR (professional_id = get_auth_user_professional_id())));

-- client_clinical_notes.clinical_notes_delete_policy
DROP POLICY IF EXISTS "clinical_notes_delete_policy" ON public.client_clinical_notes;
CREATE POLICY "clinical_notes_delete_policy" ON public.client_clinical_notes FOR DELETE TO authenticated
  USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM ((clients c
     JOIN company_members cm ON ((c.company_id = cm.company_id)))
     JOIN app_roles ar ON ((cm.role_id = ar.id)))
  WHERE ((c.id = client_clinical_notes.client_id) AND (cm.user_id = auth.uid()) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text])))))));

-- client_inactivity_log.client_inactivity_log_select
DROP POLICY IF EXISTS "client_inactivity_log_select" ON public.client_inactivity_log;
CREATE POLICY "client_inactivity_log_select" ON public.client_inactivity_log FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (users u
     JOIN company_members cm ON ((cm.user_id = u.id)))
  WHERE ((u.id = auth.uid()) AND (cm.company_id = client_inactivity_log.company_id) AND (cm.status = 'active'::text)))) OR (EXISTS ( SELECT 1
   FROM (app_roles ar
     JOIN company_members cm2 ON ((cm2.role_id = ar.id)))
  WHERE ((cm2.user_id = auth.uid()) AND (cm2.company_id = client_inactivity_log.company_id) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text])) AND (cm2.status = 'active'::text))))));

-- clients.clients_select
DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (u.company_id = clients.company_id) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text, 'member'::text, 'agent'::text, 'developer'::text]))))) OR is_client_assigned_to_user(id)));

-- company_email_accounts.company_email_accounts_all
DROP POLICY IF EXISTS "company_email_accounts_all" ON public.company_email_accounts;
CREATE POLICY "company_email_accounts_all" ON public.company_email_accounts FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (cm.company_id = company_email_accounts.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (cm.company_id = company_email_accounts.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text]))))));

-- company_email_accounts.company_email_accounts_oauth_read
DROP POLICY IF EXISTS "company_email_accounts_oauth_read" ON public.company_email_accounts;
CREATE POLICY "company_email_accounts_oauth_read" ON public.company_email_accounts FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (cm.company_id = company_email_accounts.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text]))))));

-- company_email_accounts.company_email_accounts_oauth_update
DROP POLICY IF EXISTS "company_email_accounts_oauth_update" ON public.company_email_accounts;
CREATE POLICY "company_email_accounts_oauth_update" ON public.company_email_accounts FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (cm.company_id = company_email_accounts.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text]))))));

-- company_email_logs.company_email_logs_select
DROP POLICY IF EXISTS "company_email_logs_select" ON public.company_email_logs;
CREATE POLICY "company_email_logs_select" ON public.company_email_logs FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (cm.company_id = company_email_logs.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text]))))));

-- company_email_settings.company_email_settings_all
DROP POLICY IF EXISTS "company_email_settings_all" ON public.company_email_settings;
CREATE POLICY "company_email_settings_all" ON public.company_email_settings FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (cm.company_id = company_email_settings.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text]))))));

-- company_email_verification.company_email_verification_all
DROP POLICY IF EXISTS "company_email_verification_all" ON public.company_email_verification;
CREATE POLICY "company_email_verification_all" ON public.company_email_verification FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (cm.company_id = company_email_verification.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text]))))));

-- company_feedback.company_feedback_select_company
DROP POLICY IF EXISTS "company_feedback_select_company" ON public.company_feedback;
CREATE POLICY "company_feedback_select_company" ON public.company_feedback FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = ( SELECT u.id
           FROM users u
          WHERE (u.auth_user_id = auth.uid()))) AND (cm.company_id = company_feedback.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text]))))));

-- company_filter_visibility.company_filter_visibility_write
DROP POLICY IF EXISTS "company_filter_visibility_write" ON public.company_filter_visibility;
CREATE POLICY "company_filter_visibility_write" ON public.company_filter_visibility FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = auth.uid()) AND (cm.company_id = company_filter_visibility.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'super_admin'::text, 'admin'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = auth.uid()) AND (cm.company_id = company_filter_visibility.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'super_admin'::text, 'admin'::text]))))));

-- company_invitations.Owners and admins can delete invitations
DROP POLICY IF EXISTS "Owners and admins can delete invitations" ON public.company_invitations;
CREATE POLICY "Owners and admins can delete invitations" ON public.company_invitations FOR DELETE TO authenticated
  USING (has_company_permission(company_id, ARRAY['supervisor','owner'::text, 'admin'::text]));

-- company_stage_order.company_stage_order_write
DROP POLICY IF EXISTS "company_stage_order_write" ON public.company_stage_order;
CREATE POLICY "company_stage_order_write" ON public.company_stage_order FOR ALL TO authenticated
  USING ((company_id IN ( SELECT cm.company_id
   FROM ((company_members cm
     JOIN users u ON ((u.id = cm.user_id)))
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text]))))))
  WITH CHECK ((company_id IN ( SELECT cm.company_id
   FROM ((company_members cm
     JOIN users u ON ((u.id = cm.user_id)))
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text]))))));

-- gdpr_audit_log.gdpr_audit_log_admin_access
DROP POLICY IF EXISTS "gdpr_audit_log_admin_access" ON public.gdpr_audit_log;
CREATE POLICY "gdpr_audit_log_admin_access" ON public.gdpr_audit_log FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND ((u.is_dpo = true) OR (ar.name = ANY (ARRAY['supervisor','admin'::text, 'super_admin'::text, 'owner'::text])))))));

-- gdpr_requests.gdpr_requests_company_select
DROP POLICY IF EXISTS "gdpr_requests_company_select" ON public.gdpr_requests;
CREATE POLICY "gdpr_requests_company_select" ON public.gdpr_requests FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((cm.role_id = ar.id)))
  WHERE ((cm.user_id = auth.uid()) AND (cm.company_id = gdpr_requests.company_id) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text])) AND (cm.status = 'active'::text)))));

-- gdpr_requests.gdpr_requests_update
DROP POLICY IF EXISTS "gdpr_requests_update" ON public.gdpr_requests;
CREATE POLICY "gdpr_requests_update" ON public.gdpr_requests FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((cm.role_id = ar.id)))
  WHERE ((cm.user_id = auth.uid()) AND (cm.company_id = gdpr_requests.company_id) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text])) AND (cm.status = 'active'::text))))));

-- hidden_units.Admins can manage hidden_units
DROP POLICY IF EXISTS "Admins can manage hidden_units" ON public.hidden_units;
CREATE POLICY "Admins can manage hidden_units" ON public.hidden_units FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (ar.name = ANY (ARRAY['supervisor','admin'::text, 'owner'::text, 'super_admin'::text]))))));

-- inbound_email_audit.Management can view all audit logs
DROP POLICY IF EXISTS "Management can view all audit logs" ON public.inbound_email_audit;
CREATE POLICY "Management can view all audit logs" ON public.inbound_email_audit FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (ar.name = ANY (ARRAY['supervisor','admin'::text, 'owner'::text, 'super_admin'::text]))))));

-- mail_accounts.Users can delete their own mail accounts
DROP POLICY IF EXISTS "Users can delete their own mail accounts" ON public.mail_accounts;
CREATE POLICY "Users can delete their own mail accounts" ON public.mail_accounts FOR DELETE TO authenticated
  USING (((user_id IN ( SELECT users.id
   FROM users
  WHERE (users.auth_user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM (company_members cm_admin
     JOIN app_roles ar ON ((ar.id = cm_admin.role_id)))
  WHERE ((cm_admin.user_id IN ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])) AND (cm_admin.status = 'active'::text) AND (cm_admin.company_id IN ( SELECT company_members.company_id
           FROM company_members
          WHERE ((company_members.user_id = mail_accounts.user_id) AND (company_members.status = 'active'::text)))))))));

-- mail_accounts.Users can manage their own mail accounts
DROP POLICY IF EXISTS "Users can manage their own mail accounts" ON public.mail_accounts;
CREATE POLICY "Users can manage their own mail accounts" ON public.mail_accounts FOR SELECT TO authenticated
  USING (((user_id IN ( SELECT users.id
   FROM users
  WHERE (users.auth_user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM (company_members cm_admin
     JOIN app_roles ar ON ((ar.id = cm_admin.role_id)))
  WHERE ((cm_admin.user_id IN ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])) AND (cm_admin.status = 'active'::text) AND (cm_admin.company_id IN ( SELECT company_members.company_id
           FROM company_members
          WHERE ((company_members.user_id = mail_accounts.user_id) AND (company_members.status = 'active'::text)))))))));

-- mail_accounts.Users can update their own mail accounts
DROP POLICY IF EXISTS "Users can update their own mail accounts" ON public.mail_accounts;
CREATE POLICY "Users can update their own mail accounts" ON public.mail_accounts FOR UPDATE TO authenticated
  USING (((user_id IN ( SELECT users.id
   FROM users
  WHERE (users.auth_user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM (company_members cm_admin
     JOIN app_roles ar ON ((ar.id = cm_admin.role_id)))
  WHERE ((cm_admin.user_id IN ( SELECT users.id
           FROM users
          WHERE (users.auth_user_id = auth.uid()))) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])) AND (cm_admin.status = 'active'::text) AND (cm_admin.company_id IN ( SELECT company_members.company_id
           FROM company_members
          WHERE ((company_members.user_id = mail_accounts.user_id) AND (company_members.status = 'active'::text)))))))));

-- payment_integrations.payment_integrations_select
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text]))))));

-- professional_documents.Edit own documents
DROP POLICY IF EXISTS "Edit own documents" ON public.professional_documents;
CREATE POLICY "Edit own documents" ON public.professional_documents FOR ALL TO authenticated
  USING (((professional_id IN ( SELECT professionals.id
   FROM professionals
  WHERE (professionals.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((cm.role_id = ar.id)))
  WHERE ((cm.user_id = auth.uid()) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])))))));

-- professional_documents.View own documents
DROP POLICY IF EXISTS "View own documents" ON public.professional_documents;
CREATE POLICY "View own documents" ON public.professional_documents FOR SELECT TO authenticated
  USING (((professional_id IN ( SELECT professionals.id
   FROM professionals
  WHERE (professionals.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((cm.role_id = ar.id)))
  WHERE ((cm.user_id = auth.uid()) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])))))));

-- professional_titles.Admins can manage titles
DROP POLICY IF EXISTS "Admins can manage titles" ON public.professional_titles;
CREATE POLICY "Admins can manage titles" ON public.professional_titles FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM company_members
  WHERE ((company_members.user_id = auth.uid()) AND (company_members.company_id = professional_titles.company_id) AND (company_members.role_id IN ( SELECT app_roles.id
           FROM app_roles
          WHERE (app_roles.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text]))))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM company_members
  WHERE ((company_members.user_id = auth.uid()) AND (company_members.company_id = professional_titles.company_id) AND (company_members.role_id IN ( SELECT app_roles.id
           FROM app_roles
          WHERE (app_roles.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text]))))))));

-- quotes.quotes_select_policy
DROP POLICY IF EXISTS "quotes_select_policy" ON public.quotes;
CREATE POLICY "quotes_select_policy" ON public.quotes FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = quotes.created_by) AND (u.auth_user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((cm.role_id = ar.id)))
  WHERE ((cm.user_id = auth.uid()) AND (cm.company_id = quotes.company_id) AND (cm.status = 'active'::text) AND ((ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])) OR (EXISTS ( SELECT 1
           FROM client_assignments ca
          WHERE ((ca.client_id = quotes.client_id) AND (ca.company_member_id = cm.id)))) OR (EXISTS ( SELECT 1
           FROM (professionals p
             JOIN client_assignments ca ON ((ca.professional_id = p.id)))
          WHERE ((p.user_id = auth.uid()) AND (ca.client_id = quotes.client_id))))))))));

-- scheduled_jobs.scheduled_jobs_read
DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;
CREATE POLICY "scheduled_jobs_read" ON public.scheduled_jobs FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (ar.name = ANY (ARRAY['supervisor','admin'::text, 'owner'::text, 'super_admin'::text]))))));

-- service_blocked_dates.service_blocked_dates_delete
DROP POLICY IF EXISTS "service_blocked_dates_delete" ON public.service_blocked_dates;
CREATE POLICY "service_blocked_dates_delete" ON public.service_blocked_dates FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = auth.uid()) AND (cm.company_id = service_blocked_dates.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'super_admin'::text]))))));

-- service_blocked_dates.service_blocked_dates_update
DROP POLICY IF EXISTS "service_blocked_dates_update" ON public.service_blocked_dates;
CREATE POLICY "service_blocked_dates_update" ON public.service_blocked_dates FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((ar.id = cm.role_id)))
  WHERE ((cm.user_id = auth.uid()) AND (cm.company_id = service_blocked_dates.company_id) AND (cm.status = 'active'::text) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'super_admin'::text]))))));

-- verifactu_cert_history.verifactu_cert_history_select_policy
DROP POLICY IF EXISTS "verifactu_cert_history_select_policy" ON public.verifactu_cert_history;
CREATE POLICY "verifactu_cert_history_select_policy" ON public.verifactu_cert_history FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (u.company_id = verifactu_cert_history.company_id) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])) AND (u.deleted_at IS NULL)))));

-- verifactu_settings.verifactu_settings_select_policy
DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (u.company_id = verifactu_settings.company_id) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])) AND (u.deleted_at IS NULL)))));

-- verifactu_settings.verifactu_settings_update_policy
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (u.company_id = verifactu_settings.company_id) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])) AND (u.deleted_at IS NULL)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (users u
     LEFT JOIN app_roles ar ON ((u.app_role_id = ar.id)))
  WHERE ((u.auth_user_id = auth.uid()) AND (u.company_id = verifactu_settings.company_id) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text, 'super_admin'::text])) AND (u.deleted_at IS NULL)))));

-- waitlist_rate_limits.waitlist_rate_limits_select
DROP POLICY IF EXISTS "waitlist_rate_limits_select" ON public.waitlist_rate_limits;
CREATE POLICY "waitlist_rate_limits_select" ON public.waitlist_rate_limits FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (company_members cm
     JOIN app_roles ar ON ((cm.role_id = ar.id)))
  WHERE ((cm.user_id = auth.uid()) AND (cm.company_id = waitlist_rate_limits.company_id) AND (ar.name = ANY (ARRAY['supervisor','owner'::text, 'admin'::text])) AND (cm.status = 'active'::text))))));

-- Replace is_company_owner with supervisor-aware version
CREATE OR REPLACE FUNCTION public.is_company_admin_or_supervisor(company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.app_roles ar ON ar.id = cm.role_id
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = $1
      AND cm.status = 'active'
      AND ar.name = ANY (ARRAY['owner','admin','supervisor','super_admin'])
  );
$$;

COMMIT;