-- ============================================================
-- SECURITY AUDIT: Enable RLS on all core tables that were missing it
-- Date: 2026-03-18
-- Risk: CRITICAL — Without RLS enabled, all CREATE POLICY statements
--        on these tables are silently ignored by PostgreSQL.
--        Any authenticated user could read/write ALL rows.
-- ============================================================

-- Core business tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Supporting / reference tables
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_variant_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

-- GDPR / compliance tables
ALTER TABLE public.gdpr_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_consent_records ENABLE ROW LEVEL SECURITY;

-- Finance / payment tables
ALTER TABLE public.payment_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifactu_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifactu_cert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifactu_events ENABLE ROW LEVEL SECURITY;

-- HR / org tables
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

-- Auth / onboarding tables
ALTER TABLE public.pending_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;

-- System tables
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Catalog tables (read-mostly, but still need RLS)
ALTER TABLE public.modules_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_scopes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Add baseline RLS policies for tables that had NONE at all.
-- Tables that already had policies (companies, users, clients,
-- invoices, quotes, tickets, services, notifications) will now
-- have those policies actually enforced.
-- ============================================================

-- modules_catalog: read-only for all authenticated users
CREATE POLICY "Authenticated users can read modules_catalog"
  ON public.modules_catalog FOR SELECT TO authenticated USING (true);

-- modules: read-only for all authenticated users
CREATE POLICY "Authenticated users can read modules"
  ON public.modules FOR SELECT TO authenticated USING (true);

-- tag_scopes: read-only for all authenticated users
CREATE POLICY "Authenticated users can read tag_scopes"
  ON public.tag_scopes FOR SELECT TO authenticated USING (true);

-- app_settings: read-only for authenticated, write for super_admin
CREATE POLICY "Authenticated users can read app_settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins can manage app_settings"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- scheduled_jobs: only service_role (no direct user access)
-- No user-facing policy needed; service_role bypasses RLS.

-- pending_users: only service_role manages these
-- No user-facing policy needed; edge functions use service_role.

-- company_modules: company-scoped read, admin write
CREATE POLICY "Members can view own company modules"
  ON public.company_modules FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Admins can manage own company modules"
  ON public.company_modules FOR ALL TO authenticated
  USING (public.is_company_admin(company_id));

-- employees: company-scoped
CREATE POLICY "Members can view own company employees"
  ON public.employees FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Admins can manage own company employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.is_company_admin(company_id));

-- marketing_campaigns: company-scoped
CREATE POLICY "Members can view own company campaigns"
  ON public.marketing_campaigns FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Admins can manage own company campaigns"
  ON public.marketing_campaigns FOR ALL TO authenticated
  USING (public.is_company_admin(company_id));

-- payment_integrations: company-scoped, admin only
CREATE POLICY "Admins can view own company payment integrations"
  ON public.payment_integrations FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id() AND public.is_company_admin(company_id));
CREATE POLICY "Admins can manage own company payment integrations"
  ON public.payment_integrations FOR ALL TO authenticated
  USING (public.is_company_admin(company_id));

-- verifactu_settings: company-scoped, admin only
CREATE POLICY "Admins can view own company verifactu settings"
  ON public.verifactu_settings FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Admins can manage own company verifactu settings"
  ON public.verifactu_settings FOR ALL TO authenticated
  USING (public.is_company_admin(company_id));

-- verifactu_cert_history: company-scoped, admin only
CREATE POLICY "Admins can view own company cert history"
  ON public.verifactu_cert_history FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

-- verifactu_events: company-scoped
CREATE POLICY "Members can view own company verifactu events"
  ON public.verifactu_events FOR SELECT TO authenticated
  USING (companyid = public.get_user_company_id());

-- gdpr_audit_log: company-scoped, read-only for DPO/admin
CREATE POLICY "Admins can view own company GDPR audit log"
  ON public.gdpr_audit_log FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id() AND public.is_company_admin(company_id));

-- gdpr_access_requests: company-scoped
CREATE POLICY "Admins can view own company GDPR requests"
  ON public.gdpr_access_requests FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id() AND public.is_company_admin(company_id));
CREATE POLICY "Admins can manage own company GDPR requests"
  ON public.gdpr_access_requests FOR ALL TO authenticated
  USING (public.is_company_admin(company_id));

-- gdpr_consent_records: company-scoped
CREATE POLICY "Admins can view own company GDPR consent"
  ON public.gdpr_consent_records FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Admins can manage own company GDPR consent"
  ON public.gdpr_consent_records FOR ALL TO authenticated
  USING (public.is_company_admin(company_id));

-- company_invitations: company-scoped
CREATE POLICY "Members can view own company invitations"
  ON public.company_invitations FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Admins can manage own company invitations"
  ON public.company_invitations FOR ALL TO authenticated
  USING (public.is_company_admin(company_id));

-- client_portal_users: company-scoped
CREATE POLICY "Members can view own company portal users"
  ON public.client_portal_users FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Admins can manage own company portal users"
  ON public.client_portal_users FOR ALL TO authenticated
  USING (public.is_company_admin(company_id));

-- global_tags: company-scoped
CREATE POLICY "Members can view own company tags"
  ON public.global_tags FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Members can manage own company tags"
  ON public.global_tags FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id());

-- service_variants: inherit from services (company-scoped via join)
CREATE POLICY "Members can view own company service variants"
  ON public.service_variants FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = service_variants.service_id
      AND s.company_id = public.get_user_company_id()
  ));
CREATE POLICY "Members can manage own company service variants"
  ON public.service_variants FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = service_variants.service_id
      AND s.company_id = public.get_user_company_id()
  ));

-- client_variant_assignments: company-scoped via client
CREATE POLICY "Members can view own company variant assignments"
  ON public.client_variant_assignments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_variant_assignments.client_id
      AND c.company_id = public.get_user_company_id()
  ));
CREATE POLICY "Members can manage own company variant assignments"
  ON public.client_variant_assignments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_variant_assignments.client_id
      AND c.company_id = public.get_user_company_id()
  ));

-- project_comments: company-scoped via project
CREATE POLICY "Members can view own company project comments"
  ON public.project_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_comments.project_id
      AND p.company_id = public.get_user_company_id()
  ));
CREATE POLICY "Members can manage own project comments"
  ON public.project_comments FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_comments.project_id
      AND p.company_id = public.get_user_company_id()
  ));

-- Tag bridge tables: company-scoped via the parent entity
CREATE POLICY "Members can view own company client tags"
  ON public.clients_tags FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = clients_tags.client_id
      AND c.company_id = public.get_user_company_id()
  ));
CREATE POLICY "Members can manage own company client tags"
  ON public.clients_tags FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = clients_tags.client_id
      AND c.company_id = public.get_user_company_id()
  ));

CREATE POLICY "Members can view own company service tags"
  ON public.services_tags FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = services_tags.service_id
      AND s.company_id = public.get_user_company_id()
  ));
CREATE POLICY "Members can manage own company service tags"
  ON public.services_tags FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.id = services_tags.service_id
      AND s.company_id = public.get_user_company_id()
  ));

CREATE POLICY "Members can view own company ticket tags"
  ON public.tickets_tags FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = tickets_tags.ticket_id
      AND t.company_id = public.get_user_company_id()
  ));
CREATE POLICY "Members can manage own company ticket tags"
  ON public.tickets_tags FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tickets t
    WHERE t.id = tickets_tags.ticket_id
      AND t.company_id = public.get_user_company_id()
  ));
