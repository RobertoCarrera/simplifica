-- Fix Critical RLS Leaks in payment_integrations, domains, and scheduled_jobs
-- Date: 2026-05-02
-- Author: Jules (Security Engineer)

-- 1. Secure payment_integrations
-- Previous policies did not check if the user belongs to the same company as the integration.
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
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

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO authenticated
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

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO authenticated
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

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO authenticated
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

-- 2. Secure domains
-- Previous policy allowed any admin to manage ALL domains.
-- New policy ensures admins can only manage domains assigned to users in their own company.
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;

CREATE POLICY "Admins can manage company domains" ON public.domains FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users domain_owner
    JOIN public.users current_user ON domain_owner.company_id = current_user.company_id
    LEFT JOIN public.app_roles ar ON current_user.app_role_id = ar.id
    WHERE domain_owner.auth_user_id = domains.assigned_to_user
      AND current_user.auth_user_id = auth.uid()
      AND ar.name IN ('admin', 'owner', 'super_admin')
      AND current_user.deleted_at IS NULL
  )
);

-- 3. Secure scheduled_jobs
-- This table is for backend processing and should not be exposed to the public API.
DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;
