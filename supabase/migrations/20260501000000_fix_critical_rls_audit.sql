-- Fix Critical RLS Leaks in Multi-tenant Tables
-- Date: 2026-05-01
-- Author: Jules (Security Auditor)

-- 1. Fix 'payment_integrations' policies
-- Previous policies checked for admin role but ignored company_id, allowing cross-tenant access.

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Unified policy for Select (Read)
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
USING (
  -- 1. Super Admin (Global)
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
  )
  OR
  -- 2. Company Admin/Owner (Scoped)
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
  )
);

-- Unified policy for Write (Insert, Update, Delete)
CREATE POLICY "payment_integrations_write" ON public.payment_integrations FOR ALL TO authenticated
USING (
  -- 1. Super Admin (Global)
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
  )
  OR
  -- 2. Company Admin/Owner (Scoped)
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  -- 1. Super Admin (Global)
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
  )
  OR
  -- 2. Company Admin/Owner (Scoped)
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
  )
);


-- 2. Fix 'scheduled_jobs' policies
-- Previous policy allowed PUBLIC select access to all jobs if user was admin.
-- Scheduled jobs should be internal (Service Role) or strictly scoped.
-- Dropping public/authenticated access entirely ensures only Service Role can access it (default deny).

DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;


-- 3. Fix 'domains' policies
-- Previous policies allowed any admin to view/manage ALL domains globally.

DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.domains;
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;

CREATE POLICY "Authenticated users can view verified domains" ON public.domains FOR SELECT TO authenticated
USING (
  (assigned_to_user = auth.uid()) OR
  (
    is_verified = true AND (
      -- Super Admin
      EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.app_roles ar ON u.app_role_id = ar.id
        WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
      )
      OR
      -- Company Admin of the domain owner
      EXISTS (
          SELECT 1 FROM public.company_members requester_cm
          JOIN public.users requester_u ON requester_cm.user_id = requester_u.id
          JOIN public.users target_u ON target_u.auth_user_id = domains.assigned_to_user
          WHERE requester_u.auth_user_id = auth.uid()
            AND requester_cm.company_id = target_u.company_id
            AND requester_cm.role IN ('owner', 'admin')
      )
    )
  )
);

CREATE POLICY "Admins can manage company domains" ON public.domains FOR ALL TO authenticated
USING (
  -- Super Admin
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
  )
  OR
  -- Company Admin of the domain owner
  EXISTS (
      SELECT 1 FROM public.company_members requester_cm
      JOIN public.users requester_u ON requester_cm.user_id = requester_u.id
      JOIN public.users target_u ON target_u.auth_user_id = domains.assigned_to_user
      WHERE requester_u.auth_user_id = auth.uid()
        AND requester_cm.company_id = target_u.company_id
        AND requester_cm.role IN ('owner', 'admin')
  )
);
