-- CORRECCIÓN RÁPIDA DEL SISTEMA DE EMPRESAS
-- Este script corrige los problemas identificados

-- 1. Primero, verificar y crear la función check_company_exists correcta
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

-- 2. Función para crear o unirse a empresa
CREATE OR REPLACE FUNCTION handle_company_registration(
    p_auth_user_id UUID,
    p_email TEXT,
    p_full_name TEXT,
    p_company_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    company_info RECORD;
    new_company_id UUID;
    new_user_id UUID;
    user_role TEXT := 'owner';
BEGIN
    -- Verificar si la empresa ya existe
    SELECT * INTO company_info
    FROM check_company_exists(p_company_name);
    
    IF company_info.company_exists THEN
        -- La empresa existe, el usuario debe ser 'member'
        user_role := 'member';
        new_company_id := company_info.company_id;
        
        -- Verificar si ya existe un usuario con este email en esta empresa
        IF EXISTS (
            SELECT 1 FROM public.users 
            WHERE email = p_email AND company_id = new_company_id
        ) THEN
            RETURN json_build_object(
                'success', false,
                'error', 'User already exists in this company',
                'requires_invitation_approval', true,
                'company_name', company_info.company_name,
                'owner_email', company_info.owner_email
            );
        END IF;
    ELSE
        -- La empresa no existe, crear nueva
        INSERT INTO public.companies (name, slug)
        VALUES (
            p_company_name,
            LOWER(REPLACE(p_company_name, ' ', '-')) || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT
        )
        RETURNING id INTO new_company_id;
        
        user_role := 'owner';
    END IF;
    
    -- Crear el usuario
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
        p_email,
        p_full_name,
        user_role,
        true,
        new_company_id,
        p_auth_user_id,
        '{}'::jsonb
    )
    RETURNING id INTO new_user_id;
    
    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'company_id', new_company_id,
        'role', user_role,
        'message', CASE 
            WHEN user_role = 'owner' THEN 'New company created successfully'
            ELSE 'User added to existing company'
        END
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- 3. Función mejorada para confirmar registro
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
    registration_result JSON;
BEGIN
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
    
    -- Intentar crear/unirse a la empresa
    SELECT handle_company_registration(
        p_auth_user_id,
        pending_user_data.email,
        pending_user_data.full_name,
        pending_user_data.company_name
    ) INTO registration_result;
    
    -- Si fue exitoso, marcar como confirmado
    IF (registration_result->>'success')::boolean THEN
        UPDATE public.pending_users
        SET confirmed_at = NOW()
        WHERE auth_user_id = p_auth_user_id;
    END IF;
    
    RETURN registration_result;
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- 4. Limpiar empresas duplicadas actuales
CREATE OR REPLACE FUNCTION cleanup_current_duplicates()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    duplicate_count INTEGER := 0;
    company_record RECORD;
BEGIN
    -- Buscar empresas con nombres similares y consolidar
    FOR company_record IN
        SELECT 
            c1.id as keep_id,
            c1.name as keep_name,
            c2.id as remove_id,
            c2.name as remove_name
        FROM public.companies c1
        JOIN public.companies c2 ON 
            LOWER(TRIM(c1.name)) = LOWER(TRIM(c2.name))
            AND c1.id != c2.id
            AND c1.created_at < c2.created_at
        WHERE c1.deleted_at IS NULL AND c2.deleted_at IS NULL
    LOOP
        -- Migrar usuarios de empresa duplicada a empresa original
        UPDATE public.users
        SET company_id = company_record.keep_id
        WHERE company_id = company_record.remove_id;
        
        -- Marcar empresa duplicada como eliminada
        UPDATE public.companies
        SET deleted_at = NOW()
        WHERE id = company_record.remove_id;
        
        duplicate_count := duplicate_count + 1;
    END LOOP;
    
    RETURN FORMAT('Cleaned up %s duplicate companies', duplicate_count);
END;
$$;
