-- ============================================================
-- PERFORMANCE/INTEGRITY: Add updated_at auto-update triggers
-- Date: 2026-03-19
-- Issue: 20 core tables have updated_at columns but no trigger
--        to auto-update them. Only webmail tables had triggers.
-- Uses the existing update_updated_at_column() function from
-- 20260104134000_webmail_schema.sql
-- ============================================================

-- Ensure the function exists (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Core business tables
CREATE OR REPLACE TRIGGER update_companies_modtime
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_users_modtime
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_clients_modtime
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_services_modtime
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_tickets_modtime
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Admin/config tables
CREATE OR REPLACE TRIGGER update_app_roles_modtime
  BEFORE UPDATE ON public.app_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_role_permissions_modtime
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_modules_modtime
  BEFORE UPDATE ON public.modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_tag_scopes_modtime
  BEFORE UPDATE ON public.tag_scopes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_global_tags_modtime
  BEFORE UPDATE ON public.global_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_app_settings_modtime
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_company_members_modtime
  BEFORE UPDATE ON public.company_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_company_modules_modtime
  BEFORE UPDATE ON public.company_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_employees_modtime
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Finance/compliance tables
CREATE OR REPLACE TRIGGER update_verifactu_settings_modtime
  BEFORE UPDATE ON public.verifactu_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_payment_integrations_modtime
  BEFORE UPDATE ON public.payment_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_service_variants_modtime
  BEFORE UPDATE ON public.service_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Relation tables with updated_at
CREATE OR REPLACE TRIGGER update_ticket_services_modtime
  BEFORE UPDATE ON public.ticket_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_project_comments_modtime
  BEFORE UPDATE ON public.project_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_gdpr_consent_records_modtime
  BEFORE UPDATE ON public.gdpr_consent_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
