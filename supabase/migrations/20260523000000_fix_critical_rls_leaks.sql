-- 20260523000000_fix_critical_rls_leaks.sql

-- SECURITY FIX: Enforce company_id checks on multi-tenant tables
-- Addressed Vulnerabilities:
-- 1. payment_integrations: Cross-tenant access for admins
-- 2. domains: Cross-tenant management for admins
-- 3. scheduled_jobs: Unrestricted read for admins

-- 1. Payment Integrations
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

-- 2. Domains
-- Ensure admins can only manage domains belonging to users in their own company.
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;

CREATE POLICY "Admins can manage company domains" ON public.domains FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u_admin
    LEFT JOIN public.app_roles ar ON u_admin.app_role_id = ar.id
    JOIN public.users u_owner ON u_owner.auth_user_id = domains.assigned_to_user
    WHERE u_admin.auth_user_id = auth.uid()
      AND u_admin.company_id = u_owner.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u_admin.deleted_at IS NULL
  )
);

-- 3. Scheduled Jobs
-- Remove public/admin access if it lacks company_id check. Restrict to service_role.
DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;

CREATE POLICY "scheduled_jobs_service_role" ON public.scheduled_jobs
FOR ALL TO service_role USING (true) WITH CHECK (true);
