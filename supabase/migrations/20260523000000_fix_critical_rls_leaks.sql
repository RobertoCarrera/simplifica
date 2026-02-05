-- Migration: Fix Critical RLS Leaks
-- Date: 2026-05-23
-- Description: Fixes cross-tenant data leaks in payment_integrations, domains, and scheduled_jobs.

-- 1. Payment Integrations
-- Previous policies allowed ANY admin to see ALL integrations.
-- New policies enforce company_id match.

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
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
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = payment_integrations.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
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
  )
);

-- 2. Domains
-- Previous policies allowed ANY admin to see ALL domains.
-- New policies restrict to the assigned user OR admins of the SAME company.

DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.domains;
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;
DROP POLICY IF EXISTS "Users can insert domains" ON public.domains;
DROP POLICY IF EXISTS "Users can update own domains" ON public.domains;
DROP POLICY IF EXISTS "Users can delete own domains" ON public.domains;

-- Select: My domains OR domains of users in my company (if I am admin)
CREATE POLICY "domains_select" ON public.domains
FOR SELECT TO authenticated
USING (
  assigned_to_user = auth.uid()
  OR
  EXISTS (
    SELECT 1
    FROM public.users owner_user
    JOIN public.users my_user ON owner_user.company_id = my_user.company_id
    LEFT JOIN public.app_roles ar ON my_user.app_role_id = ar.id
    WHERE owner_user.auth_user_id = domains.assigned_to_user
      AND my_user.auth_user_id = auth.uid()
      AND ar.name IN ('admin', 'owner', 'super_admin')
  )
);

-- Insert: Can only assign to myself
CREATE POLICY "domains_insert" ON public.domains
FOR INSERT TO authenticated
WITH CHECK (
  assigned_to_user = auth.uid()
);

-- Update: Only if it's mine (Admins can delete/recreate if needed, but usually only verify/delete)
-- Let's allow admins to update too if needed, but safest is just owner.
CREATE POLICY "domains_update" ON public.domains
FOR UPDATE TO authenticated
USING (
  assigned_to_user = auth.uid()
  OR
  EXISTS (
    SELECT 1
    FROM public.users owner_user
    JOIN public.users my_user ON owner_user.company_id = my_user.company_id
    LEFT JOIN public.app_roles ar ON my_user.app_role_id = ar.id
    WHERE owner_user.auth_user_id = domains.assigned_to_user
      AND my_user.auth_user_id = auth.uid()
      AND ar.name IN ('admin', 'owner', 'super_admin')
  )
);

-- Delete: Same as Select/Update
CREATE POLICY "domains_delete" ON public.domains
FOR DELETE TO authenticated
USING (
  assigned_to_user = auth.uid()
  OR
  EXISTS (
    SELECT 1
    FROM public.users owner_user
    JOIN public.users my_user ON owner_user.company_id = my_user.company_id
    LEFT JOIN public.app_roles ar ON my_user.app_role_id = ar.id
    WHERE owner_user.auth_user_id = domains.assigned_to_user
      AND my_user.auth_user_id = auth.uid()
      AND ar.name IN ('admin', 'owner', 'super_admin')
  )
);

-- 3. Scheduled Jobs
-- Internal table, not for frontend. Revoke public/authenticated access.

DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;

-- No new policy needed for authenticated/public. Default deny applies if RLS is on.
-- Ensure RLS is on (it should be).
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
