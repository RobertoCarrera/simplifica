-- Migration: Fix Company Invitations RLS Policies (Debug/Fix)
-- Date: 2026-01-11 02:00:00

-- Drop potentially problematic policies
DROP POLICY IF EXISTS "Company members can view invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Owners and admins can delete invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Owners and admins can create invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Owners and admins can update invitations" ON public.company_invitations;

-- Create direct, explicit policies avoiding function dependencies where possible

-- 1. SELECT: Allow any member (or owner) to view invitations for their company
CREATE POLICY "Company members can view invitations" ON public.company_invitations
    FOR SELECT USING (
        -- Check if user is a member of the company (Owner is a member with role='owner')
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = auth.uid()
        )
        OR
        -- Keep the "view my own invite permissions" for accepted/pending users via email
        (lower(email) = lower(auth.jwt() ->> 'email'))
    );

-- 2. INSERT: Owners and Admins
CREATE POLICY "Owners and admins can create invitations" ON public.company_invitations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = auth.uid()
            AND cm.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
        AND
        invited_by_user_id = auth.uid()
    );

-- 3. DELETE: Owners and Admins
CREATE POLICY "Owners and admins can delete invitations" ON public.company_invitations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = auth.uid()
            AND cm.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    );

-- 4. UPDATE: Owners and Admins (e.g. canceling/resending)
CREATE POLICY "Owners and admins can update invitations" ON public.company_invitations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = auth.uid()
            AND cm.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    );
