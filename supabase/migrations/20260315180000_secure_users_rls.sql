-- Migration: Secure users table RLS policies
-- Fixes: V-01 (CRITICAL) Users can escalate privileges via unrestricted UPDATE
-- Fixes: V-02 (HIGH) All authenticated users can SELECT all profiles across companies

-- ============================================
-- 1. Fix UPDATE policy — block sensitive column changes
-- ============================================
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (
    auth_user_id = auth.uid()
    -- Prevent privilege escalation: these columns must remain unchanged
    AND company_id         IS NOT DISTINCT FROM (SELECT company_id         FROM public.users WHERE auth_user_id = auth.uid())
    AND app_role_id        IS NOT DISTINCT FROM (SELECT app_role_id        FROM public.users WHERE auth_user_id = auth.uid())
    AND permissions        IS NOT DISTINCT FROM (SELECT permissions        FROM public.users WHERE auth_user_id = auth.uid())
    AND data_access_level  IS NOT DISTINCT FROM (SELECT data_access_level  FROM public.users WHERE auth_user_id = auth.uid())
    AND is_dpo             IS NOT DISTINCT FROM (SELECT is_dpo             FROM public.users WHERE auth_user_id = auth.uid())
  );

-- ============================================
-- 2. Fix SELECT policy — scope to own company + own row
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.users;

-- Users can see their own row always, and other users in the same company
CREATE POLICY "Users can view own company profiles" ON public.users
  FOR SELECT
  USING (
    auth_user_id = auth.uid()
    OR company_id = public.get_user_company_id()
  );

-- Super admins need to see all users for admin panel
CREATE POLICY "Super admins can view all profiles" ON public.users
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.app_roles r ON u.app_role_id = r.id
      WHERE u.auth_user_id = auth.uid()
        AND r.name = 'super_admin'
    )
  );
