-- ============================================================
-- SECURITY AUDIT: Fix ALL broken RLS policies referencing public.profiles
-- Date: 2026-03-18
-- Risk: HIGH — policies use profiles.id = auth.uid() but the profiles
--        view uses user_id (not id), and role value is 'super_admin' not 'superadmin'.
--        These policies silently fail, blocking legitimate superadmin access.
-- ============================================================

-- ============================================================
-- 1. Fix domains table policies
-- ============================================================

-- Drop ALL broken policies on domains that reference profiles incorrectly
DROP POLICY IF EXISTS "Companies can view their own domains" ON public.domains;
DROP POLICY IF EXISTS "SuperAdmins can do everything on domains" ON public.domains;
DROP POLICY IF EXISTS "superadmin_full_access_domains" ON public.domains;

-- Recreate: company members can view their own domains
CREATE POLICY "Companies can view their own domains"
ON public.domains
FOR SELECT
USING (
  company_id IN (
    SELECT cm.company_id FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
  )
);

-- Recreate: super_admins can do everything on domains
CREATE POLICY "SuperAdmins can do everything on domains"
ON public.domains
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
  )
);

-- ============================================================
-- 2. Fix domain_orders table policies
-- ============================================================

-- Drop ALL broken policies
DROP POLICY IF EXISTS "SuperAdmins can view all orders" ON public.domain_orders;
DROP POLICY IF EXISTS "SuperAdmins can update orders" ON public.domain_orders;
DROP POLICY IF EXISTS "superadmin_full_access_domain_orders" ON public.domain_orders;

-- Recreate: super_admins can view all orders
CREATE POLICY "SuperAdmins can view all orders"
ON public.domain_orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
  )
);

-- Recreate: super_admins can update orders
CREATE POLICY "SuperAdmins can update orders"
ON public.domain_orders
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
  )
);

-- Also fix the INSERT policy on domain_orders which uses user_id = auth.uid()
-- (company_members.user_id is the internal user ID, not auth.uid())
DROP POLICY IF EXISTS "Users can create orders for their company" ON public.domain_orders;

CREATE POLICY "Users can create orders for their company"
ON public.domain_orders
FOR INSERT
WITH CHECK (
  company_id IN (
    SELECT cm.company_id FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
  )
);
