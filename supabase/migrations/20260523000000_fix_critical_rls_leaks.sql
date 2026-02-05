-- Migration: Fix Critical RLS Leaks in payment_integrations, domains, and scheduled_jobs
-- Description: Enforces strict company_id isolation.
-- Date: 2026-05-23

-- 1. Payment Integrations
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

-- 2. Domains
DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.domains;
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;
DROP POLICY IF EXISTS "Users can view assigned mail domains" ON public.domains;

CREATE POLICY "Users can view assigned domains" ON public.domains FOR SELECT TO authenticated
USING (
  assigned_to_user = auth.uid()
);

CREATE POLICY "Admins can manage company domains" ON public.domains FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u_admin
    JOIN public.app_roles ar ON u_admin.app_role_id = ar.id
    JOIN public.users u_domain_owner ON u_domain_owner.auth_user_id = domains.assigned_to_user
    WHERE u_admin.auth_user_id = auth.uid()
      AND ar.name IN ('admin', 'owner', 'super_admin')
      AND u_admin.company_id = u_domain_owner.company_id
      AND u_admin.deleted_at IS NULL
  )
);

-- 3. Scheduled Jobs
-- Restrict to service_role only to prevent leakage
DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;
