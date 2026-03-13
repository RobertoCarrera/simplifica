-- Migration: Fix Critical RLS Leaks in Payment Integrations and Domains
-- Date: 2026-02-26
-- Description: Updates RLS policies to strictly enforce company isolation.

-- 1. PAYMENT INTEGRATIONS
-- Drop insecure policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Recreate strict policies checking company_id
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


-- 2. DOMAINS (formerly mail_domains)
-- Drop insecure policies
DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.domains;
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;

-- Recreate strict policies
-- Admins can only view/manage domains where the assigned user belongs to THEIR company
CREATE POLICY "Admins can manage company domains" ON public.domains FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users admin_user
    JOIN public.users target_user ON target_user.auth_user_id = domains.assigned_to_user
    LEFT JOIN public.app_roles ar ON admin_user.app_role_id = ar.id
    WHERE admin_user.auth_user_id = auth.uid()
      AND admin_user.company_id = target_user.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND admin_user.deleted_at IS NULL
  )
);

-- Users can still view their own assigned domains (keep or recreate just in case)
DROP POLICY IF EXISTS "Users can view assigned mail domains" ON public.domains; -- Clean up old name if exists
CREATE POLICY "Users can view assigned domains" ON public.domains FOR SELECT TO authenticated
USING (
  assigned_to_user = auth.uid()
);


-- 3. SCHEDULED JOBS
-- Drop insecure policy allowing any admin to read ALL jobs
DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;

-- No replacement policy means only service_role (and potentially postgres/superuser) can access.
-- This is secure for internal job queues.
