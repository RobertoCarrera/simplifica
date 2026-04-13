-- Migration: Allow Super Admins to view and manage company-less invitations
-- Date: 2026-02-19 12:00:00

-- Drop existing policies to recreate them with Super Admin and NULL company support
DROP POLICY IF EXISTS "Company members can view invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Owners and admins can create invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Owners and admins can delete invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Owners and admins can update invitations" ON public.company_invitations;

-- 1. SELECT: Allow members to view their company invites, users to view their own invite, 
-- or Super Admins to view everything (including orphan invites for new owners)
CREATE POLICY "Company members and superadmins can view invitations" ON public.company_invitations
FOR SELECT USING (
    -- Super Admin can see ALL invitations
    public.is_super_admin(auth.uid())
    OR
    -- Check if user is a member of the company (join only if company_id is not null)
    (
        company_invitations.company_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = auth.uid()
        )
    )
    OR
    -- Keep the "view my own invite permissions" for accepted/pending users via email 
    (lower(email) = lower(auth.jwt() ->> 'email'))
    OR
    -- The person who created the invite can see it (vital for orphan invites)
    invited_by_user_id = auth.uid()
);

-- 2. INSERT: Owners/Admins for company invites, Super Admins for any invite (including owner invites)
CREATE POLICY "Authorized users can create invitations" ON public.company_invitations
FOR INSERT WITH CHECK (
    -- Super Admin can create any invite
    (public.is_super_admin(auth.uid()))
    OR
    -- Owners and Admins can create invites for their company
    (
        company_invitations.company_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = auth.uid()
            AND cm.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    )
);

-- 3. DELETE: Owners/Admins or Super Admins or the inviter
CREATE POLICY "Authorized users can delete invitations" ON public.company_invitations
FOR DELETE USING (
    -- Super Admin can delete any invite
    (public.is_super_admin(auth.uid()))
    OR
    -- Owners and Admins for their company
    (
        company_invitations.company_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = auth.uid()
            AND cm.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    )
    OR
    -- The person who created the invite
    invited_by_user_id = auth.uid()
);

-- 4. UPDATE: Owners/Admins or Super Admins or the inviter
CREATE POLICY "Authorized users can update invitations" ON public.company_invitations
FOR UPDATE USING (
    -- Super Admin can update any invite
    (public.is_super_admin(auth.uid()))
    OR
    -- Owners and Admins for their company
    (
        company_invitations.company_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = auth.uid()
            AND cm.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    )
    OR
    -- The person who created the invite
    invited_by_user_id = auth.uid()
);
