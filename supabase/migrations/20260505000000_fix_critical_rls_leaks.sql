-- Fix Critical RLS Leaks found in Audit 2026-05

-- 1. Payment Integrations
-- Previous policies allowed any admin to see all integrations.
-- Fix: Enforce company_id match.

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
  )
);

-- 2. Domains
-- Previous policies allowed any admin to manage all domains.
-- Fix: Ensure the domain owner and the requester belong to the same company.

DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.domains;
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;

CREATE POLICY "Authenticated users can view verified domains" ON public.domains FOR SELECT TO authenticated
USING (
  (assigned_to_user = auth.uid()) OR
  (
    is_verified = true AND EXISTS (
        SELECT 1 FROM public.users requester
        JOIN public.users owner ON owner.auth_user_id = domains.assigned_to_user
        LEFT JOIN public.app_roles ar ON requester.app_role_id = ar.id
        WHERE requester.auth_user_id = auth.uid()
        AND requester.company_id = owner.company_id
        AND ar.name IN ('admin', 'owner', 'super_admin')
    )
  )
);

CREATE POLICY "Admins can manage all domains" ON public.domains FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users requester
    JOIN public.users owner ON owner.auth_user_id = domains.assigned_to_user
    LEFT JOIN public.app_roles ar ON requester.app_role_id = ar.id
    WHERE requester.auth_user_id = auth.uid()
    AND requester.company_id = owner.company_id
    AND ar.name IN ('admin', 'owner', 'super_admin')
  )
);

-- 3. Scheduled Jobs
-- Not used by frontend. Restrict to service_role only.
DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;
