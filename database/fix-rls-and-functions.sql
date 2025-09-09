-- ============================================
-- SOLUCIONAR ERRORES DE RLS Y FUNCIONES
-- ============================================

-- PASO 1: Limpiar funciones duplicadas
DROP FUNCTION IF EXISTS public.invite_user_to_company(text, text, text);
DROP FUNCTION IF EXISTS public.invite_user_to_company(character varying, character varying, character varying);
DROP FUNCTION IF EXISTS public.invite_user_to_company;

-- PASO 2: Verificar y arreglar políticas RLS problemáticas en user_profiles
-- Primero deshabilitamos RLS temporalmente
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

-- Eliminamos todas las políticas problemáticas
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view company profiles" ON public.user_profiles;

-- Recreamos políticas simples y no recursivas
CREATE POLICY "user_profiles_select_own" ON public.user_profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "user_profiles_update_own" ON public.user_profiles
    FOR UPDATE USING (id = auth.uid());

-- Rehabilitamos RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- PASO 3: Crear función de invitación única y correcta
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
    current_user_company_id UUID;
    current_user_role TEXT;
    new_user_id UUID;
    result JSON;
BEGIN
    -- Obtener empresa y rol del usuario actual (método directo)
    SELECT u.company_id, u.role
    INTO current_user_company_id, current_user_role
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
    AND u.active = true
    LIMIT 1;
    
    -- Verificar que el usuario actual existe
    IF current_user_company_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Usuario no encontrado o inactivo'
        );
    END IF;
    
    -- Solo owners y admins pueden invitar
    IF current_user_role NOT IN ('owner', 'admin') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo owners y administradores pueden invitar usuarios'
        );
    END IF;
    
    -- Verificar si el usuario ya existe
    IF EXISTS (
        SELECT 1 FROM public.users 
        WHERE email = user_email 
        AND company_id = current_user_company_id 
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
        'message', 'Usuario invitado correctamente'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', 'Error: ' || SQLERRM
    );
END;
$$;

-- Dar permisos
GRANT EXECUTE ON FUNCTION public.invite_user_to_company(text, text, text) TO authenticated;

-- VERIFICACIÓN
SELECT 'FUNCIONES LIMPIAS:' as info;
SELECT proname, pronargs FROM pg_proc WHERE proname = 'invite_user_to_company';
