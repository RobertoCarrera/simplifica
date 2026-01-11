-- Fix RPCs failing due to missing 'role' column on public.users
-- Switching to use app_roles table and app_role_id
-- UPDATED: Correcting lookup to use u.auth_user_id = auth.uid() instead of u.id = auth.uid()

-- 1. admin_list_user_modules
CREATE OR REPLACE FUNCTION public.admin_list_user_modules(p_owner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_role_name text;
    v_target_company_id uuid;
    v_users jsonb;
    v_modules jsonb;
    v_assignments jsonb;
BEGIN
    -- Security: Get caller's role name via app_roles
    -- FIX: Use auth_user_id to match auth.uid()
    SELECT ar.name INTO v_user_role_name
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid();
    
    -- Access Control
    IF v_user_role_name IS NULL OR v_user_role_name NOT IN ('owner', 'admin', 'super_admin') THEN
         RAISE EXCEPTION 'Access denied';
    END IF;

    -- Determine Target Company
    IF p_owner_id IS NOT NULL THEN
        -- p_owner_id is expected to be public.users.id (passed from frontend selection)
        SELECT company_id INTO v_target_company_id FROM public.users WHERE id = p_owner_id;
        IF v_target_company_id IS NULL THEN
             RETURN jsonb_build_object('users', '[]'::jsonb, 'modules', '[]'::jsonb, 'assignments', '[]'::jsonb);
        END IF;
    ELSE
        -- Fallback to current user's company
        -- FIX: Use auth_user_id
        SELECT company_id INTO v_target_company_id FROM public.users WHERE auth_user_id = auth.uid();
        IF v_target_company_id IS NULL THEN
             RETURN jsonb_build_object('users', '[]'::jsonb, 'modules', '[]'::jsonb, 'assignments', '[]'::jsonb);
        END IF;
    END IF;

    -- Fetch Users
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'name', COALESCE(u.name || ' ' || COALESCE(u.surname, ''), u.email),
            'role', ar.name, -- Map to 'role' for frontend compatibility
            'app_role_name', ar.name,
            'active', COALESCE(u.active, true)
        )
    ) INTO v_users
    FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.company_id = v_target_company_id;

    -- Fetch Modules
    SELECT jsonb_agg(
        jsonb_build_object(
            'key', m.key,
            'name', m.label
        ) ORDER BY m.key ASC
    ) INTO v_modules
    FROM public.modules_catalog m;

    -- Fetch Assignments
    SELECT jsonb_agg(
        jsonb_build_object(
            'user_id', um.user_id,
            'module_key', um.module_key,
            'status', um.status
        )
    ) INTO v_assignments
    FROM public.user_modules um
    WHERE um.user_id IN (SELECT id FROM public.users WHERE company_id = v_target_company_id);

    RETURN jsonb_build_object(
        'users', COALESCE(v_users, '[]'::jsonb),
        'modules', COALESCE(v_modules, '[]'::jsonb),
        'assignments', COALESCE(v_assignments, '[]'::jsonb)
    );
END;
$function$;

-- 2. admin_list_owners
-- Used by Super Admin to select which company/owner to manage
CREATE OR REPLACE FUNCTION public.admin_list_owners()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_role_name text;
    v_owners jsonb;
BEGIN
    -- Security Check
    -- FIX: Use auth_user_id
    SELECT ar.name INTO v_user_role_name
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid();

    IF v_user_role_name IS NULL OR v_user_role_name != 'super_admin' THEN
         RAISE EXCEPTION 'Access denied';
    END IF;

    -- Select users who have app_role = 'owner'
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'name', COALESCE(u.name || ' ' || COALESCE(u.surname, ''), u.email),
            'company_id', u.company_id, -- Required by frontend
            'company_name', c.name
        ) ORDER BY c.name ASC NULLS LAST
    ) INTO v_owners
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    LEFT JOIN public.companies c ON u.company_id = c.id
    WHERE ar.name = 'owner';

    RETURN COALESCE(v_owners, '[]'::jsonb);
END;
$function$;
