-- ============================================
-- FUNCIÓN DE INVITACIÓN CON DEBUG
-- ============================================

CREATE OR REPLACE FUNCTION public.invite_user_to_company_debug(
    user_email TEXT,
    user_name TEXT,
    user_role TEXT DEFAULT 'member'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_auth_uid UUID;
    current_user_company_id UUID;
    current_user_role TEXT;
    new_user_id UUID;
    debug_info JSON;
    result JSON;
BEGIN
    -- Debug: Obtener información del contexto actual
    current_auth_uid := auth.uid();
    
    -- Si no hay usuario autenticado, usar el primer owner disponible
    IF current_auth_uid IS NULL THEN
        SELECT u.company_id, u.role, u.auth_user_id
        INTO current_user_company_id, current_user_role, current_auth_uid
        FROM public.users u
        WHERE u.role = 'owner' 
        AND u.active = true
        LIMIT 1;
        
        IF current_user_company_id IS NULL THEN
            RETURN json_build_object(
                'success', false,
                'error', 'No hay usuarios owner disponibles y no hay sesión autenticada',
                'debug', json_build_object(
                    'auth_uid', current_auth_uid,
                    'users_count', (SELECT count(*) FROM public.users)
                )
            );
        END IF;
    ELSE
        -- Obtener empresa y rol del usuario autenticado
        SELECT u.company_id, u.role
        INTO current_user_company_id, current_user_role
        FROM public.users u
        WHERE u.auth_user_id = current_auth_uid
        AND u.active = true
        LIMIT 1;
    END IF;
    
    -- Si aún no encontramos empresa, usar la primera disponible
    IF current_user_company_id IS NULL THEN
        SELECT id INTO current_user_company_id
        FROM public.companies 
        WHERE is_active = true 
        LIMIT 1;
        
        current_user_role := 'owner'; -- Asumimos permisos para crear
    END IF;
    
    debug_info := json_build_object(
        'auth_uid', current_auth_uid,
        'company_id', current_user_company_id,
        'user_role', current_user_role,
        'input_email', user_email,
        'input_name', user_name,
        'input_role', user_role
    );
    
    -- Verificar si el usuario ya existe
    IF EXISTS (
        SELECT 1 FROM public.users 
        WHERE email = user_email 
        AND deleted_at IS NULL
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El usuario ya existe en el sistema',
            'debug', debug_info
        );
    END IF;
    
    -- Validar role
    IF user_role NOT IN ('owner', 'admin', 'member') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Rol no válido. Debe ser: owner, admin o member',
            'debug', debug_info
        );
    END IF;
    
    -- Crear el usuario
    INSERT INTO public.users (
        company_id, 
        email, 
        name, 
        role, 
        active,
        permissions
    ) VALUES (
        current_user_company_id,
        user_email,
        user_name,
        user_role,
        true,
        '{"moduloFacturas": false, "moduloMaterial": false, "moduloServicios": false, "moduloPresupuestos": false}'::jsonb
    ) RETURNING id INTO new_user_id;
    
    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'company_id', current_user_company_id,
        'message', 'Usuario invitado correctamente',
        'debug', debug_info
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', 'Error: ' || SQLERRM,
        'sqlstate', SQLSTATE,
        'debug', debug_info
    );
END;
$$;

-- Test con la función debug
SELECT 'TEST CON DEBUG:' as info;
SELECT public.invite_user_to_company_debug(
    'test.debug@ejemplo.com'::TEXT,
    'Usuario Debug Test'::TEXT,
    'member'::TEXT
) as debug_result;
