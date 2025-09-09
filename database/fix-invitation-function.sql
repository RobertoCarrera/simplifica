-- ============================================
-- ARREGLAR FUNCIÓN DE INVITACIÓN
-- ============================================

-- Eliminar función anterior con problemas
DROP FUNCTION IF EXISTS public.invite_user_to_company(TEXT, TEXT, TEXT, UUID);

-- Función corregida que respeta los constraints actuales
CREATE OR REPLACE FUNCTION public.invite_user_to_company(
    user_email TEXT,
    user_name TEXT DEFAULT NULL,
    user_role TEXT DEFAULT 'member',
    target_company_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    company_uuid UUID;
    user_exists BOOLEAN;
BEGIN
    -- Validar role
    IF user_role NOT IN ('owner', 'admin', 'member') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Role inválido. Debe ser: owner, admin, o member'
        );
    END IF;
    
    -- Obtener company_id
    IF target_company_id IS NULL THEN
        SELECT id INTO company_uuid 
        FROM companies 
        WHERE is_active = true 
        ORDER BY created_at 
        LIMIT 1;
    ELSE
        company_uuid := target_company_id;
    END IF;
    
    IF company_uuid IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'No se encontró una empresa válida'
        );
    END IF;
    
    -- Verificar si el usuario ya existe
    SELECT EXISTS(SELECT 1 FROM public.users WHERE email = user_email) INTO user_exists;
    
    IF user_exists THEN
        -- Actualizar usuario existente
        UPDATE public.users 
        SET 
            name = COALESCE(user_name, name),
            role = user_role,
            active = false, -- Inactivo hasta que acepte
            updated_at = NOW(),
            permissions = CASE 
                WHEN user_role = 'owner' THEN '{"canManageUsers": true, "canSeeAllData": true}'::jsonb
                WHEN user_role = 'admin' THEN '{"canManageUsers": true}'::jsonb
                ELSE '{}'::jsonb
            END
        WHERE email = user_email;
        
        RETURN json_build_object(
            'success', true,
            'message', 'Usuario existente actualizado para invitación',
            'email', user_email,
            'company_id', company_uuid
        );
    ELSE
        -- Crear nuevo usuario
        INSERT INTO public.users (
            company_id,
            email,
            name,
            role,
            active,
            permissions
        ) VALUES (
            company_uuid,
            user_email,
            COALESCE(user_name, user_email),
            user_role,
            false, -- Inactivo hasta que acepte
            CASE 
                WHEN user_role = 'owner' THEN '{"canManageUsers": true, "canSeeAllData": true}'::jsonb
                WHEN user_role = 'admin' THEN '{"canManageUsers": true}'::jsonb
                ELSE '{}'::jsonb
            END
        );
        
        RETURN json_build_object(
            'success', true,
            'message', 'Usuario preparado para invitación',
            'email', user_email,
            'company_id', company_uuid
        );
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test de la función
SELECT public.invite_user_to_company(
    'puchu.carrera@gmail.com',
    'Roberto Carrera', 
    'owner'
);
