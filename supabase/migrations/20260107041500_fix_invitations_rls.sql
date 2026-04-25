-- Migration: Fix company_invitations RLS for Multi-Tenancy
-- Date: 2026-01-07 04:15:00

-- Previous policies relied on users.company_id or get_user_company_id()
-- We need to update them to use company_members checks via our helper functions.

-- 1. Drop existing policies
DROP POLICY IF EXISTS "Company admins can delete invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Company members can view invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Owners and admins can create invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Inviter can manage own invitations" ON public.company_invitations;

-- 2. Create new policies using multi-tenant helpers

-- VIEW: Members of the company can view invitations
CREATE POLICY "Company members can view invitations" ON public.company_invitations
    FOR SELECT USING (
        public.is_company_member(company_id)
    );

-- INSERT: Owners and Admins can create invitations
CREATE POLICY "Owners and admins can create invitations" ON public.company_invitations
    FOR INSERT WITH CHECK (
        public.has_company_permission(company_id, ARRAY['owner', 'admin'])
        AND
        invited_by_user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    );

-- DELETE: Owners and Admins can delete invitations
CREATE POLICY "Owners and admins can delete invitations" ON public.company_invitations
    FOR DELETE USING (
        public.has_company_permission(company_id, ARRAY['owner', 'admin'])
    );

-- UPDATE: Inviter can update their own invitations (e.g. resend) OR Admins
CREATE POLICY "Owners and admins can update invitations" ON public.company_invitations
    FOR UPDATE USING (
        public.has_company_permission(company_id, ARRAY['owner', 'admin'])
    ) WITH CHECK (
        public.has_company_permission(company_id, ARRAY['owner', 'admin'])
    );

-- Note: "Public can read invitation by token" and "Service role..." policies remain untouched.
