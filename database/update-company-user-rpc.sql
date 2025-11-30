-- ========================================
-- RPC: update_company_user
-- Actualiza rol o estado activo de un usuario de la empresa
-- con validaciones de negocio server-side
-- ========================================

DROP FUNCTION IF EXISTS update_company_user(UUID, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION update_company_user(
    p_user_id UUID,
    p_role TEXT DEFAULT NULL,
    p_active BOOLEAN DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    caller public.users;
    target public.users;
BEGIN
    -- Obtener el usuario que hace la llamada
    SELECT * INTO caller
    FROM public.users
    WHERE auth_user_id = auth.uid()
      AND active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no encontrado o inactivo');
    END IF;

    -- Obtener el usuario objetivo
    SELECT * INTO target
    FROM public.users
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Usuario objetivo no encontrado');
    END IF;

    -- Verificar que pertenecen a la misma empresa
    IF caller.company_id != target.company_id THEN
        RETURN json_build_object('success', false, 'error', 'No tienes permisos para modificar usuarios de otra empresa');
    END IF;

    -- Verificar que el caller tiene permisos (owner o admin)
    IF caller.role NOT IN ('owner', 'admin') THEN
        RETURN json_build_object('success', false, 'error', 'Solo owner o admin pueden modificar usuarios');
    END IF;

    -- ==========================================
    -- VALIDACIONES PARA CAMBIO DE ROL
    -- ==========================================
    IF p_role IS NOT NULL THEN
        -- Validar que el rol sea válido
        IF p_role NOT IN ('owner', 'admin', 'member') THEN
            RETURN json_build_object('success', false, 'error', 'Rol no válido. Debe ser: owner, admin o member');
        END IF;

        -- REGLA: Solo admin puede asignar rol admin
        -- Owner NO puede asignar admin, solo member u owner
        IF p_role = 'admin' AND caller.role != 'admin' THEN
            RETURN json_build_object('success', false, 'error', 'Solo un administrador puede asignar el rol admin');
        END IF;

        -- REGLA: Un admin no puede asignar rol owner
        IF p_role = 'owner' AND caller.role = 'admin' THEN
            RETURN json_build_object('success', false, 'error', 'Un administrador no puede asignar el rol owner');
        END IF;

        -- REGLA: No puedes cambiar tu propio rol
        IF caller.id = target.id THEN
            RETURN json_build_object('success', false, 'error', 'No puedes cambiar tu propio rol');
        END IF;

        -- REGLA: Un admin no puede cambiar el rol de un owner
        IF caller.role = 'admin' AND target.role = 'owner' THEN
            RETURN json_build_object('success', false, 'error', 'Un administrador no puede modificar el rol de un owner');
        END IF;

        -- Actualizar el rol
        UPDATE public.users
        SET role = p_role
        WHERE id = p_user_id;
    END IF;

    -- ==========================================
    -- VALIDACIONES PARA CAMBIO DE ESTADO ACTIVO
    -- ==========================================
    IF p_active IS NOT NULL THEN
        -- REGLA: No puedes desactivarte a ti mismo
        IF caller.id = target.id AND p_active = false THEN
            RETURN json_build_object('success', false, 'error', 'No puedes desactivarte a ti mismo');
        END IF;

        -- REGLA: Un admin no puede desactivar a un owner
        IF caller.role = 'admin' AND target.role = 'owner' AND p_active = false THEN
            RETURN json_build_object('success', false, 'error', 'Un administrador no puede desactivar a un owner');
        END IF;

        -- Actualizar el estado activo
        UPDATE public.users
        SET active = p_active
        WHERE id = p_user_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'user_id', p_user_id,
        'role', COALESCE(p_role, target.role),
        'active', COALESCE(p_active, target.active)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Dar permisos de ejecución
GRANT EXECUTE ON FUNCTION update_company_user(UUID, TEXT, BOOLEAN) TO authenticated;

-- ========================================
-- COMENTARIOS DE LA FUNCIÓN
-- ========================================
COMMENT ON FUNCTION update_company_user IS 
'Actualiza rol o estado activo de un usuario de la empresa con validaciones:
- Solo admin puede asignar rol admin
- Owner puede asignar member u owner, pero NO admin
- Admin no puede asignar owner
- Nadie puede cambiar su propio rol
- Nadie puede desactivarse a sí mismo
- Admin no puede modificar roles/estado de owners';
