-- Migration: Allow Super Admins to view and manage company-less invitations (Fixed version)
-- Date: 2026-03-11 15:30:00

-- Drop existing policies to recreate them with proper Super Admin and NULL company support
DROP POLICY IF EXISTS "Company members and superadmins can view invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Authorized users can create invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Authorized users can delete invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Authorized users can update invitations" ON public.company_invitations;

-- No tocamos la función is_super_admin para evitar errores de dependencias de políticas.
-- Si necesitas actualizarla, hazlo en una migración aparte con CASCADE si es estrictamente necesario,
-- pero para esta migración de invitaciones no hace falta si ya existe.

-- 1. SELECT: Super Admins view everything, members view their company, invitees view their own, inviter views theirs
CREATE POLICY "Company members and superadmins can view invitations" ON public.company_invitations
FOR SELECT USING (
    public.is_super_admin(auth.uid())
    OR
    (
        company_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        )
    )
    OR
    (lower(email) = lower(auth.jwt() ->> 'email'))
    OR
    invited_by_user_id = auth.uid()
);

-- 2. INSERT: Super Admins or Owners/Admins of company
CREATE POLICY "Authorized users can create invitations" ON public.company_invitations
FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR
    (
        company_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
            AND cm.role_id IN (SELECT id FROM public.app_roles WHERE name IN ('owner', 'admin'))
        )
    )
    OR
    invited_by_user_id = auth.uid()
);

-- 3. DELETE and 4. UPDATE
CREATE POLICY "Authorized users can delete invitations" ON public.company_invitations
FOR DELETE USING (
    public.is_super_admin(auth.uid())
    OR
    invited_by_user_id = auth.uid()
);

CREATE POLICY "Authorized users can update invitations" ON public.company_invitations
FOR UPDATE USING (
    public.is_super_admin(auth.uid())
    OR
    invited_by_user_id = auth.uid()
);
