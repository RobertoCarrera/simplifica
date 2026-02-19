-- Fix RLS Recursion by introducing a security definer function for ID lookup

-- 1. Create Helper Function
CREATE OR REPLACE FUNCTION public.get_my_public_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_public_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_public_id() TO service_role;

-- 2. Update company_members RLS policies to use the function (Avoiding lookup on users table which might trigger recursion)

-- Users can view own memberships
DROP POLICY IF EXISTS "Users can view own memberships" ON public.company_members;
CREATE POLICY "Users can view own memberships" ON public.company_members
    FOR SELECT USING (
        user_id = public.get_my_public_id()
    );

-- Company admins can view members
DROP POLICY IF EXISTS "Company admins can view members" ON public.company_members;
CREATE POLICY "Company admins can view members" ON public.company_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id = public.get_my_public_id()
            AND requester.company_id = company_members.company_id
            AND requester.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    );

-- Company admins can update members
DROP POLICY IF EXISTS "Company admins can update members" ON public.company_members;
CREATE POLICY "Company admins can update members" ON public.company_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id = public.get_my_public_id()
            AND requester.company_id = company_members.company_id
            AND requester.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    );

-- Company admins can delete members
DROP POLICY IF EXISTS "Company admins can delete members" ON public.company_members;
CREATE POLICY "Company admins can delete members" ON public.company_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id = public.get_my_public_id()
            AND requester.company_id = company_members.company_id
            AND requester.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    );
