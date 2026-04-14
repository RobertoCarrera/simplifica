-- Fix update_company_user to check company_members instead of users.company_id
-- This allows managing users who are members of a company via company_members
-- even if their primary users.company_id points to a different company (multi-tenant)
CREATE OR REPLACE FUNCTION public.update_company_user(
    p_user_id uuid,
    p_role text DEFAULT NULL::text,
    p_active boolean DEFAULT NULL::boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    caller_id uuid;
    caller_role text;
    caller_company_id uuid;
    
    target_role text;
    target_active boolean;
    target_membership_exists boolean;
    
    v_new_role_id uuid;
BEGIN
    -- Get Caller Context (from company_members)
    SELECT u.id, ar.name, cm.company_id
    INTO caller_id, caller_role, caller_company_id
    FROM public.users u
    JOIN public.company_members cm ON u.id = cm.user_id
    JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND cm.status = 'active'
    LIMIT 1;

    IF caller_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no encontrado o inactivo');
    END IF;

    -- Get Target Context (check membership in CALLER's company, not users.company_id)
    SELECT ar.name, u.active, true
    INTO target_role, target_active, target_membership_exists
    FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.user_id = p_user_id
      AND cm.company_id = caller_company_id;

    IF NOT COALESCE(target_membership_exists, false) THEN
        RETURN json_build_object('success', false, 'error', 'El usuario no es miembro de tu empresa');
    END IF;

    -- Check Caller Permissions
    IF caller_role NOT IN ('owner', 'admin') THEN
        RETURN json_build_object('success', false, 'error', 'Solo owner o admin pueden modificar usuarios');
    END IF;

    -- UPDATE ROLE
    IF p_role IS NOT NULL THEN
        SELECT id INTO v_new_role_id FROM public.app_roles WHERE name = p_role;
        IF v_new_role_id IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Rol no válido');
        END IF;

        -- Admin cannot assign Owner
        IF p_role = 'owner' AND caller_role = 'admin' THEN
            RETURN json_build_object('success', false, 'error', 'Un administrador no puede asignar el rol owner');
        END IF;
        
        -- Cannot change own role
        IF caller_id = p_user_id THEN
             RETURN json_build_object('success', false, 'error', 'No puedes cambiar tu propio rol');
        END IF;

        -- Admin cannot change Owner's role
        IF caller_role = 'admin' AND target_role = 'owner' THEN
             RETURN json_build_object('success', false, 'error', 'Un administrador no puede modificar el rol de un owner');
        END IF;

        -- Update Membership role in company_members
        UPDATE public.company_members
        SET role_id = v_new_role_id, updated_at = NOW()
        WHERE user_id = p_user_id AND company_id = caller_company_id;
    END IF;

    -- UPDATE ACTIVE
    IF p_active IS NOT NULL THEN
        IF caller_id = p_user_id AND p_active = false THEN
            RETURN json_build_object('success', false, 'error', 'No puedes desactivarte a ti mismo');
        END IF;
        
        IF caller_role = 'admin' AND target_role = 'owner' AND p_active = false THEN
             RETURN json_build_object('success', false, 'error', 'Un administrador no puede desactivar a un owner');
        END IF;

        UPDATE public.users SET active = p_active WHERE id = p_user_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'user_id', p_user_id,
        'role', COALESCE(p_role, target_role),
        'active', COALESCE(p_active, target_active)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;
