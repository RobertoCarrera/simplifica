-- MIGRACIÓN DE SEGURIDAD: FIX INVITATIONS RLS
-- Fecha: 2026-02-01
-- Descripción: Corrige el fallo crítico de seguridad/funcionalidad donde auth.uid() (Auth UUID)
-- se comparaba directamente con user_id (Public UUID) en las políticas de invitaciones.

-- 1. Eliminar políticas rotas anteriores
DROP POLICY IF EXISTS "Company members can view invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Owners and admins can create invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Owners and admins can delete invitations" ON public.company_invitations;
DROP POLICY IF EXISTS "Owners and admins can update invitations" ON public.company_invitations;

-- 2. SELECT: Permitir ver a miembros (usando ID público correcto) o al invitado (por email)
CREATE POLICY "Company members can view invitations" ON public.company_invitations
    FOR SELECT USING (
        -- Miembro de la empresa (Dueño/Admin/Empleado)
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = public.get_my_public_id() -- FIX: Uso de ID público
            AND cm.status = 'active'
        )
        OR
        -- El propio invitado (por email en JWT)
        (lower(email) = lower(auth.jwt() ->> 'email'))
    );

-- 3. INSERT: Solo Owners y Admins activos
CREATE POLICY "Owners and admins can create invitations" ON public.company_invitations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = public.get_my_public_id() -- FIX: Uso de ID público
            AND cm.role IN ('owner', 'admin')
            AND cm.status = 'active'
        )
        AND
        -- Asegurar que el remitente es quien dice ser
        invited_by_user_id = public.get_my_public_id() -- FIX: Uso de ID público
    );

-- 4. DELETE: Solo Owners y Admins activos
CREATE POLICY "Owners and admins can delete invitations" ON public.company_invitations
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = public.get_my_public_id() -- FIX: Uso de ID público
            AND cm.role IN ('owner', 'admin')
            AND cm.status = 'active'
        )
    );

-- 5. UPDATE: Solo Owners y Admins activos
CREATE POLICY "Owners and admins can update invitations" ON public.company_invitations
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = public.get_my_public_id() -- FIX: Uso de ID público
            AND cm.role IN ('owner', 'admin')
            AND cm.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = company_invitations.company_id
            AND cm.user_id = public.get_my_public_id() -- FIX: Uso de ID público
            AND cm.role IN ('owner', 'admin')
            AND cm.status = 'active'
        )
    );
