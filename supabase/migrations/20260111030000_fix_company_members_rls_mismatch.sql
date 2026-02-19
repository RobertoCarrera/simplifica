-- Fix RLS policies on company_members due to user_id mismatch (public.users.id vs auth.uid())

-- 1. Users can view own memberships
DROP POLICY IF EXISTS "Users can view own memberships" ON public.company_members;
CREATE POLICY "Users can view own memberships" ON public.company_members
    FOR SELECT USING (
        user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- 2. Company admins can view members
-- We can optimize by using the mapping lookup once
DROP POLICY IF EXISTS "Company admins can view members" ON public.company_members;
CREATE POLICY "Company admins can view members" ON public.company_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND requester.company_id = company_members.company_id
            AND requester.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    );

-- 3. Company admins can update members
DROP POLICY IF EXISTS "Company admins can update members" ON public.company_members;
CREATE POLICY "Company admins can update members" ON public.company_members
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND requester.company_id = company_members.company_id
            AND requester.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    );

-- 4. Company admins can delete members
DROP POLICY IF EXISTS "Company admins can delete members" ON public.company_members;
CREATE POLICY "Company admins can delete members" ON public.company_members
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members requester
            WHERE requester.user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND requester.company_id = company_members.company_id
            AND requester.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    );
