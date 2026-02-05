-- Fix RLS vulnerabilities in payment_integrations, domains, and scheduled_jobs
-- Description: Fixes critical cross-tenant data leaks by enforcing company_id checks.

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
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
      AND u.deleted_at IS NULL
  )
);

-- 2. Domains
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;

CREATE POLICY "Admins can manage all domains" ON public.domains FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users admin_user
    LEFT JOIN public.app_roles ar ON admin_user.app_role_id = ar.id
    JOIN public.users target_user ON domains.assigned_to_user = target_user.auth_user_id
    WHERE admin_user.auth_user_id = auth.uid()
      AND ar.name IN ('admin', 'owner', 'super_admin')
      AND admin_user.company_id = target_user.company_id
      AND admin_user.deleted_at IS NULL
  )
);

-- 3. Scheduled Jobs
DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;

-- Restrict to service_role only
CREATE POLICY "scheduled_jobs_service_role" ON public.scheduled_jobs
FOR ALL TO service_role
USING (true)
WITH CHECK (true);
