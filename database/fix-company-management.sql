-- ========================================
-- SOLUCIÓN COMPLETA PARA GESTIÓN DE EMPRESAS
-- ========================================

-- Este script soluciona:
-- 1. Empresas duplicadas
-- 2. Uso incorrecto del nombre de empresa
-- 3. Falta de validación de duplicados
-- 4. Sistema de invitaciones para unirse a empresas existentes

-- ========================================
-- 1. CREAR TABLA DE INVITACIONES
-- ========================================

-- Asegurar extensión para gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Añadir columna surname a public.users y backfill desde name (split)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'surname'
    ) THEN
        ALTER TABLE public.users ADD COLUMN surname TEXT;

        -- Backfill: mover la parte después del primer espacio a surname, dejar el primer token en name
        UPDATE public.users
        SET surname = NULLIF(regexp_replace(name, '^[^\s]+\s*', ''), '')
        WHERE surname IS NULL;

        UPDATE public.users
        SET name = split_part(name, ' ', 1)
        WHERE name IS NOT NULL;
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.company_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    invited_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::TEXT,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    responded_at TIMESTAMP WITH TIME ZONE NULL,
    
    -- Un email solo puede tener una invitación pendiente por empresa
    UNIQUE(company_id, email, status) DEFERRABLE INITIALLY DEFERRED
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_company_invitations_company ON public.company_invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON public.company_invitations(email);
CREATE INDEX IF NOT EXISTS idx_company_invitations_token ON public.company_invitations(token);
CREATE INDEX IF NOT EXISTS idx_company_invitations_status ON public.company_invitations(status);

-- Reglas de unicidad: permitir histórico de invitaciones pero solo 1 PENDING por (company_id, email)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
            AND table_name = 'company_invitations'
            AND constraint_type = 'UNIQUE'
            AND constraint_name = 'company_invitations_company_id_email_status_key'
    ) THEN
        ALTER TABLE public.company_invitations
            DROP CONSTRAINT company_invitations_company_id_email_status_key;
    END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_invitations_pending_one_per_email_company
ON public.company_invitations(company_id, email)
WHERE status = 'pending';

-- RLS para invitaciones
ALTER TABLE public.company_invitations ENABLE ROW LEVEL SECURITY;

-- Solo miembros de la empresa pueden ver sus invitaciones
CREATE POLICY "Company members can view invitations"
ON public.company_invitations
FOR SELECT
USING (
    company_id IN (
        SELECT company_id FROM public.users 
        WHERE auth_user_id = auth.uid() AND active = true
    )
);

-- Solo owners/admins pueden crear invitaciones
CREATE POLICY "Owners and admins can create invitations"
ON public.company_invitations
FOR INSERT
WITH CHECK (
    invited_by_user_id IN (
        SELECT id FROM public.users 
        WHERE auth_user_id = auth.uid() 
        AND company_id = company_invitations.company_id
        AND role IN ('owner', 'admin')
        AND active = true
    )
);

-- Solo el que invitó puede actualizar (cancelar)
CREATE POLICY "Inviter can update invitations"
ON public.company_invitations
FOR UPDATE
USING (
    invited_by_user_id IN (
        SELECT id FROM public.users 
        WHERE auth_user_id = auth.uid() AND active = true
    )
);

-- ========================================
-- 2. FUNCIÓN MEJORADA PARA CONFIRMACIÓN DE USUARIOS
-- ========================================

-- Función para verificar si una empresa existe por nombre
CREATE OR REPLACE FUNCTION check_company_exists(p_company_name TEXT)
RETURNS TABLE(
    company_exists BOOLEAN,
    company_id UUID,
    company_name TEXT,
    owner_email TEXT,
    owner_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        EXISTS(SELECT 1 FROM public.companies WHERE LOWER(name) = LOWER(p_company_name)) as company_exists,
        c.id as company_id,
        c.name as company_name,
        u.email as owner_email,
        u.name as owner_name
    FROM public.companies c
    LEFT JOIN public.users u ON u.company_id = c.id AND u.role = 'owner' AND u.active = true
    WHERE LOWER(c.name) = LOWER(p_company_name)
    LIMIT 1;
END;
$$;

-- Función mejorada para confirmar registro de usuario
CREATE OR REPLACE FUNCTION confirm_user_registration(
    p_auth_user_id UUID,
    p_confirmation_token TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    pending_user_data public.pending_users;
    existing_company_info RECORD;
    new_company_id UUID;
    new_user_id UUID;
    invitation_id UUID;
    result JSON;
BEGIN
    -- Validar que el usuario autenticado coincide con el p_auth_user_id
    IF auth.uid() IS DISTINCT FROM p_auth_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Buscar usuario pendiente
    SELECT * INTO pending_user_data
    FROM public.pending_users
    WHERE auth_user_id = p_auth_user_id
    AND (p_confirmation_token IS NULL OR confirmation_token = p_confirmation_token)
    AND confirmed_at IS NULL
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Invalid or expired confirmation'
        );
    END IF;
    
    -- Verificar si la empresa ya existe (solo si se proporcionó company_name)
    IF pending_user_data.company_name IS NOT NULL AND TRIM(pending_user_data.company_name) != '' THEN
        SELECT * INTO existing_company_info
        FROM check_company_exists(pending_user_data.company_name);
        
        IF existing_company_info.company_exists THEN
            -- La empresa existe, crear invitación automática
            -- Primero buscar al owner para crear la invitación
            SELECT id INTO invitation_id
            FROM public.users
            WHERE company_id = existing_company_info.company_id 
            AND role = 'owner' 
            AND active = true
            LIMIT 1;
            
            IF invitation_id IS NOT NULL THEN
                -- Crear invitación automática
                INSERT INTO public.company_invitations (
                    company_id,
                    email,
                    invited_by_user_id,
                    role,
                    status,
                    message
                ) VALUES (
                    existing_company_info.company_id,
                    pending_user_data.email,
                    invitation_id,
                    'member',
                    'pending',
                    'Solicitud automática generada durante el registro'
                );
                
                -- Marcar como confirmado pero sin crear usuario aún
                UPDATE public.pending_users
                SET confirmed_at = NOW()
                WHERE auth_user_id = p_auth_user_id;
                
                RETURN json_build_object(
                    'success', true,
                    'requires_invitation_approval', true,
                    'company_name', existing_company_info.company_name,
                    'owner_email', existing_company_info.owner_email,
                    'message', 'Company already exists. Invitation sent to company owner for approval.'
                );
            END IF;
        END IF;
    END IF;
    
    -- Si llegamos aquí, crear nueva empresa
    INSERT INTO public.companies (name, slug, is_active)
    VALUES (
        COALESCE(
            NULLIF(TRIM(pending_user_data.company_name), ''), -- Usar company_name si no está vacío
            SPLIT_PART(pending_user_data.email, '@', 1)       -- Fallback al email
        ),
        LOWER(COALESCE(
            NULLIF(TRIM(pending_user_data.company_name), ''),
            SPLIT_PART(pending_user_data.email, '@', 1)
        )) || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
        true
    )
    RETURNING id INTO new_company_id;
    
    -- Crear usuario como owner
    INSERT INTO public.users (
        email,
        name, 
        role,
        active,
        company_id,
        auth_user_id,
        permissions
    )
    VALUES (
        pending_user_data.email,
        pending_user_data.full_name,
        'owner',
        true,
        new_company_id,
        pending_user_data.auth_user_id,
        '{}'::jsonb
    )
    RETURNING id INTO new_user_id;
    
    -- Marcar como confirmado
    UPDATE public.pending_users
    SET confirmed_at = NOW()
    WHERE auth_user_id = p_auth_user_id;
    
    RETURN json_build_object(
        'success', true,
        'company_id', new_company_id,
        'user_id', new_user_id,
        'is_owner', true,
        'message', 'Registration confirmed successfully. New company created.'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- ========================================
-- 3. FUNCIONES PARA GESTIÓN DE INVITACIONES
-- ========================================

-- Función para enviar invitación a una empresa
CREATE OR REPLACE FUNCTION invite_user_to_company(
    p_company_id UUID,
    p_email TEXT,
    p_role TEXT DEFAULT 'member',
    p_message TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inviter_id UUID;
    invitation_id UUID;
    company_name TEXT;
BEGIN
    -- Verificar que el usuario actual es owner o admin de la empresa
    SELECT u.id, c.name INTO inviter_id, company_name
    FROM public.users u
    JOIN public.companies c ON c.id = u.company_id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = p_company_id
    AND u.role IN ('owner', 'admin')
    AND u.active = true;
    
    IF inviter_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Unauthorized or company not found'
        );
    END IF;
    
    -- Verificar que el email no está ya en la empresa
    IF EXISTS(
        SELECT 1 FROM public.users 
        WHERE email = p_email AND company_id = p_company_id AND active = true
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User already exists in this company'
        );
    END IF;
    
    -- Cancelar invitaciones pendientes anteriores
    UPDATE public.company_invitations
    SET status = 'expired'
    WHERE email = p_email 
    AND company_id = p_company_id 
    AND status = 'pending';
    
    -- Crear nueva invitación
    INSERT INTO public.company_invitations (
        company_id,
        email,
        invited_by_user_id,
        role,
        message
    )
    VALUES (
        p_company_id,
        p_email,
        inviter_id,
        p_role,
        p_message
    )
    RETURNING id INTO invitation_id;
    
    RETURN json_build_object(
        'success', true,
        'invitation_id', invitation_id,
        'company_name', company_name,
        'message', 'Invitation sent successfully'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Función para aceptar una invitación
CREATE OR REPLACE FUNCTION accept_company_invitation(
    p_invitation_token TEXT,
    p_auth_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    invitation_data public.company_invitations;
    pending_user_data public.pending_users;
    new_user_id UUID;
    company_name TEXT;
BEGIN
    -- Validar que el usuario autenticado coincide con el p_auth_user_id
    IF auth.uid() IS DISTINCT FROM p_auth_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Buscar invitación válida
    SELECT * INTO invitation_data
    FROM public.company_invitations
    WHERE token = p_invitation_token
    AND status = 'pending'
    AND expires_at > NOW();
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Invalid or expired invitation'
        );
    END IF;
    
    -- Buscar datos del usuario pendiente
    SELECT * INTO pending_user_data
    FROM public.pending_users
    WHERE auth_user_id = p_auth_user_id
    AND email = invitation_data.email;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Pending user data not found'
        );
    END IF;
    
    -- Obtener nombre de la empresa
    SELECT name INTO company_name
    FROM public.companies
    WHERE id = invitation_data.company_id;
    
    -- Crear usuario en la empresa
    INSERT INTO public.users (
        email,
        name,
        role,
        active,
        company_id,
        auth_user_id,
        permissions
    )
    VALUES (
        pending_user_data.email,
        pending_user_data.full_name,
        invitation_data.role,
        true,
        invitation_data.company_id,
        pending_user_data.auth_user_id,
        '{}'::jsonb
    )
    RETURNING id INTO new_user_id;
    
    -- Marcar invitación como aceptada
    UPDATE public.company_invitations
    SET 
        status = 'accepted',
        responded_at = NOW()
    WHERE id = invitation_data.id;
    
    -- Marcar usuario pendiente como confirmado
    UPDATE public.pending_users
    SET confirmed_at = NOW()
    WHERE auth_user_id = p_auth_user_id;
    
    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'company_id', invitation_data.company_id,
        'company_name', company_name,
        'role', invitation_data.role,
        'message', 'Invitation accepted successfully'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- ========================================
-- 4. FUNCIONES DE LIMPIEZA
-- ========================================

-- Función para limpiar datos duplicados actuales
CREATE OR REPLACE FUNCTION cleanup_duplicate_companies()
RETURNS TABLE(
    action TEXT,
    details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    dup_record RECORD;
    users_migrated INTEGER := 0;
    total_companies_cleaned INTEGER := 0;
BEGIN
    -- Procesar cada empresa duplicada
    FOR dup_record IN
        WITH duplicates AS (
            SELECT 
                name,
                id,
                created_at,
                ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY created_at DESC) as rn
            FROM public.companies
            WHERE deleted_at IS NULL
        ),
        to_keep AS (
            SELECT name, id as keep_id
            FROM duplicates 
            WHERE rn = 1
        ),
        to_remove AS (
            SELECT d.name, d.id as remove_id, tk.keep_id
            FROM duplicates d
            JOIN to_keep tk ON LOWER(d.name) = LOWER(tk.name)
            WHERE d.rn > 1
        )
        SELECT * FROM to_remove
    LOOP
        -- Migrar usuarios de empresa duplicada a empresa principal
        UPDATE public.users
        SET company_id = dup_record.keep_id
        WHERE company_id = dup_record.remove_id;
        
        GET DIAGNOSTICS users_migrated = ROW_COUNT;
        
        -- Marcar empresa duplicada como eliminada
        UPDATE public.companies
        SET deleted_at = NOW()
        WHERE id = dup_record.remove_id;
        
        total_companies_cleaned := total_companies_cleaned + 1;
        
        RETURN QUERY SELECT 
            'MIGRATED'::TEXT,
            FORMAT('Company "%s": migrated %s users from %s to %s', 
                   dup_record.name, users_migrated, dup_record.remove_id, dup_record.keep_id);
    END LOOP;
    
    IF total_companies_cleaned = 0 THEN
        RETURN QUERY SELECT 'NO_DUPLICATES'::TEXT, 'No duplicate companies found';
    ELSE
        RETURN QUERY SELECT 'COMPLETED'::TEXT, FORMAT('Cleaned up %s duplicate companies', total_companies_cleaned);
    END IF;
END;
$$;

-- ========================================
-- 5. VISTAS ADMINISTRATIVAS
-- ========================================

-- Vista para gestión de invitaciones
-- Para evitar errores al cambiar nombres/orden de columnas, forzamos drop y recreate
DROP VIEW IF EXISTS admin_company_invitations;
CREATE VIEW admin_company_invitations AS
SELECT 
    ci.id,
    ci.company_id,
    ci.email,
    ci.role,
    ci.status,
    ci.created_at,
    ci.expires_at,
    ci.responded_at,
    c.name as company_name,
    u.name as invited_by_name,
    u.email as invited_by_email,
    CASE 
        WHEN ci.status = 'pending' AND ci.expires_at < NOW() THEN 'expired'
        ELSE ci.status
    END as effective_status
FROM public.company_invitations ci
JOIN public.companies c ON ci.company_id = c.id
JOIN public.users u ON ci.invited_by_user_id = u.id
ORDER BY ci.created_at DESC;

-- Vista para análisis de empresas
CREATE OR REPLACE VIEW admin_company_analysis AS
SELECT 
    c.id,
    c.name,
    c.slug,
    c.created_at,
    COUNT(u.id) as total_users,
    COUNT(u.id) FILTER (WHERE u.role = 'owner') as owners_count,
    COUNT(u.id) FILTER (WHERE u.role = 'admin') as admins_count,
    COUNT(u.id) FILTER (WHERE u.role = 'member') as members_count,
    COUNT(ci.id) FILTER (WHERE ci.status = 'pending') as pending_invitations,
    STRING_AGG(u.email, ', ') FILTER (WHERE u.role = 'owner') as owner_emails
FROM public.companies c
LEFT JOIN public.users u ON c.id = u.company_id AND u.active = true
LEFT JOIN public.company_invitations ci ON c.id = ci.company_id AND ci.status = 'pending'
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name, c.slug, c.created_at
ORDER BY c.created_at DESC;

-- ========================================
-- EJECUTAR LIMPIEZA INICIAL
-- ========================================

-- Limpiar empresas duplicadas existentes
SELECT * FROM cleanup_duplicate_companies();

-- Mostrar resumen final
SELECT 'SETUP COMPLETED' as status;
SELECT 'Company management system configured successfully' as message;
SELECT 'Next steps:' as info;
SELECT '1. Update frontend to handle invitation flow' as step1;
SELECT '2. Add company invitation UI components' as step2;
SELECT '3. Configure email notifications for invitations' as step3;

-- ========================================
-- 6. ACCIONES DE APROBACIÓN/RECHAZO PARA INVITACIONES (OWNER/ADMIN)
-- ========================================

-- Aprobar invitación: crea el usuario inmediatamente usando pending_users
CREATE OR REPLACE FUNCTION approve_company_invitation(
    p_invitation_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inv public.company_invitations;
    approver public.users;
    pend public.pending_users;
    new_user_id UUID;
    company_name TEXT;
BEGIN
    -- Obtener invitación
    SELECT * INTO inv FROM public.company_invitations WHERE id = p_invitation_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invitation not found');
    END IF;

    -- Validar permisos: el caller debe ser owner/admin de esa empresa
    SELECT u.* INTO approver
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = inv.company_id
      AND u.active = true
      AND u.role IN ('owner','admin')
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Obtener pending user por email (confirmado o no)
    SELECT * INTO pend
    FROM public.pending_users
    WHERE email = inv.email
    ORDER BY created_at DESC
    LIMIT 1;

    -- Crear usuario si aún no existe
    IF NOT EXISTS (
        SELECT 1 FROM public.users WHERE email = inv.email AND company_id = inv.company_id AND active = true
    ) THEN
        INSERT INTO public.users (
            email, name, role, active, company_id, auth_user_id, permissions
        ) VALUES (
            inv.email,
            COALESCE(pend.full_name, split_part(inv.email, '@', 1)),
            inv.role,
            true,
            inv.company_id,
            pend.auth_user_id,
            '{}'::jsonb
        ) RETURNING id INTO new_user_id;
    END IF;

    -- Marcar invitación y pending_user
    UPDATE public.company_invitations
    SET status = 'accepted', responded_at = NOW()
    WHERE id = inv.id;

    IF pend.id IS NOT NULL THEN
      UPDATE public.pending_users
      SET confirmed_at = COALESCE(confirmed_at, NOW()), status = 'confirmed'
      WHERE id = pend.id;
    END IF;

    SELECT name INTO company_name FROM public.companies WHERE id = inv.company_id;

    RETURN json_build_object(
        'success', true,
        'company_id', inv.company_id,
        'company_name', company_name,
        'user_id', new_user_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Rechazar invitación
CREATE OR REPLACE FUNCTION reject_company_invitation(
    p_invitation_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inv public.company_invitations;
    approver public.users;
BEGIN
    SELECT * INTO inv FROM public.company_invitations WHERE id = p_invitation_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invitation not found');
    END IF;

    -- Validar permisos: owner/admin de la empresa
    SELECT u.* INTO approver
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = inv.company_id
      AND u.active = true
      AND u.role IN ('owner','admin')
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    UPDATE public.company_invitations
    SET status = 'rejected', responded_at = NOW()
    WHERE id = inv.id;

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ========================================
-- 7. GRANTS PARA RPCs (exposición vía PostgREST)
-- ========================================
GRANT EXECUTE ON FUNCTION check_company_exists(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION confirm_user_registration(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION invite_user_to_company(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_company_invitation(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_company_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_company_invitation(UUID) TO authenticated;

-- Dar permisos de lectura a vistas administrativas necesarias en frontend
GRANT SELECT ON admin_company_invitations TO authenticated;
GRANT SELECT ON admin_company_analysis TO authenticated;
