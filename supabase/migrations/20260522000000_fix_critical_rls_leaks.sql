-- Fix Critical RLS Leaks in Multi-tenant Tables
-- Date: 2026-05-22
-- Author: Jules (Security Engineer)
-- Description:
-- 1. Restricts payment_integrations access to company admins/owners of the SAME company.
-- 2. Restricts domains admin access to admins of the SAME company as the domain owner.
-- 3. Removes public access to scheduled_jobs (restricts to service_role).

-- ---------------------------------------------------------
-- 1. Fix Payment Integrations
-- ---------------------------------------------------------

-- Drop insecure policies that allowed cross-tenant access
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Create secure policies ensuring company_id match
CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO authenticated
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

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations
FOR INSERT TO authenticated
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

CREATE POLICY "payment_integrations_update" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
)
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

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations
FOR DELETE TO authenticated
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

-- ---------------------------------------------------------
-- 2. Fix Domains (formerly mail_domains)
-- ---------------------------------------------------------

-- Drop insecure policy
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;

-- Create secure policy ensuring admin shares company with domain owner
CREATE POLICY "Admins can manage company domains" ON public.domains
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users me
    JOIN public.users target ON target.auth_user_id = domains.assigned_to_user
    LEFT JOIN public.app_roles ar ON me.app_role_id = ar.id
    WHERE me.auth_user_id = auth.uid()
      AND me.company_id = target.company_id
      AND ar.name IN ('admin', 'owner', 'super_admin')
      AND me.deleted_at IS NULL
  )
);

-- ---------------------------------------------------------
-- 3. Fix Scheduled Jobs
-- ---------------------------------------------------------

-- Drop insecure policy (fallback to default deny for non-superusers/non-service_role)
DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;
