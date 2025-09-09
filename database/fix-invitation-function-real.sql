-- ============================================
-- FUNCIÓN DE INVITACIÓN CORREGIDA
-- ============================================

-- Primero, eliminar función anterior si existe
DROP FUNCTION IF EXISTS public.invite_user_to_company(text, text, text);

-- Función corregida basada en el schema real
CREATE OR REPLACE FUNCTION public.invite_user_to_company(
    user_email TEXT,
    user_name TEXT,
    user_role TEXT DEFAULT 'member'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_record RECORD;
    target_company_id UUID;
    new_user_id UUID;
    auth_user_id UUID;
    result JSON;
BEGIN
    -- Obtener datos del usuario actual y su empresa
    SELECT u.*, c.id as company_id, c.name as company_name, c.is_active
    INTO current_user_record
    FROM public.users u
    JOIN public.companies c ON c.id = u.company_id
    WHERE u.auth_user_id = auth.uid()
    AND u.active = true
    AND c.is_active = true
    LIMIT 1;
    
    -- Verificar que el usuario actual existe y tiene permisos
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Usuario no encontrado o sin permisos para invitar'
        );
    END IF;
    
    -- Solo owners y admins pueden invitar
    IF current_user_record.role NOT IN ('owner', 'admin') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo owners y administradores pueden invitar usuarios'
        );
    END IF;
    
    target_company_id := current_user_record.company_id;
    
    -- Verificar si el usuario ya existe en la empresa
    IF EXISTS (
        SELECT 1 FROM public.users 
        WHERE email = user_email 
        AND company_id = target_company_id 
        AND deleted_at IS NULL
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El usuario ya existe en esta empresa'
        );
    END IF;
    
    -- Validar role
    IF user_role NOT IN ('owner', 'admin', 'member') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Rol no válido. Debe ser: owner, admin o member'
        );
    END IF;
    
    -- Crear el usuario en public.users (sin auth_user_id por ahora)
    INSERT INTO public.users (
        company_id, 
        email, 
        name, 
        role, 
        active,
        permissions
    ) VALUES (
        target_company_id,
        user_email,
        user_name,
        user_role,
        true,
        '{"moduloFacturas": false, "moduloMaterial": false, "moduloServicios": false, "moduloPresupuestos": false}'::jsonb
    ) RETURNING id INTO new_user_id;
    
    -- También crear entrada en invitations para tracking
    INSERT INTO public.invitations (
        company_id,
        email,
        role,
        invited_by,
        token,
        expires_at
    ) VALUES (
        target_company_id,
        user_email,
        user_role,
        auth.uid(),
        encode(gen_random_bytes(32), 'base64'),
        NOW() + INTERVAL '7 days'
    );
    
    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'company_id', target_company_id,
        'message', 'Usuario invitado correctamente a ' || current_user_record.company_name
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', 'Error en la base de datos: ' || SQLERRM,
        'detail', SQLSTATE
    );
END;
$$;

-- Dar permisos a la función
GRANT EXECUTE ON FUNCTION public.invite_user_to_company(text, text, text) TO authenticated;

-- Test de la función
SELECT 'TESTING FUNCIÓN:' as info;
SELECT public.invite_user_to_company(
    'test.nuevo@ejemplo.com',
    'Usuario Test Nuevo',
    'member'
) as test_result;
