-- 1. Create admin_list_companies RPC
-- Used by Super Admin to select a target company directly
-- Also dropping old admin_list_user_modules to allow parameter rename
DROP FUNCTION IF EXISTS public.admin_list_user_modules(uuid);

CREATE OR REPLACE FUNCTION public.admin_list_companies()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_role_name text;
    v_companies jsonb;
BEGIN
    -- Security Check: Super Admin Only
    SELECT ar.name INTO v_user_role_name
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid();

    IF v_user_role_name IS NULL OR v_user_role_name != 'super_admin' THEN
         RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'created_at', c.created_at,
            'subscription_tier', c.subscription_tier,
            'is_active', c.is_active
        ) ORDER BY c.name ASC
    ) INTO v_companies
    FROM public.companies c;

    RETURN jsonb_build_object('companies', COALESCE(v_companies, '[]'::jsonb));
END;
$function$;

-- 2. Update admin_list_user_modules to accept p_company_id directly
-- This replaces the previous logic that required an owner_id to find the company
CREATE OR REPLACE FUNCTION public.admin_list_user_modules(p_company_id uuid DEFAULT NULL::uuid)
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
    -- Security: Get caller's role name
    SELECT ar.name INTO v_user_role_name
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid();
    
    -- Access Control: Owner, Admin, Super Admin
    IF v_user_role_name IS NULL OR v_user_role_name NOT IN ('owner', 'admin', 'super_admin') THEN
         RAISE EXCEPTION 'Access denied';
    END IF;

    -- Determine Target Company
    IF p_company_id IS NOT NULL THEN
        -- Verify Super Admin access when switching context explicitly?
        -- For now, we trust the caller if they are allowed roles.
        -- Ideally, only super_admin can request arbitrary p_company_id.
        -- Owners/Admins should probably only see their own.
        
        IF v_user_role_name = 'super_admin' THEN
            v_target_company_id := p_company_id;
        ELSE
            -- If not super admin, force their own company ignoring param
             SELECT company_id INTO v_target_company_id FROM public.users WHERE auth_user_id = auth.uid();
        END IF;
    ELSE
        -- Fallback to current user's company
        SELECT company_id INTO v_target_company_id FROM public.users WHERE auth_user_id = auth.uid();
    END IF;

    IF v_target_company_id IS NULL THEN
         RETURN jsonb_build_object('users', '[]'::jsonb, 'modules', '[]'::jsonb, 'assignments', '[]'::jsonb);
    END IF;

    -- Fetch Users
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'name', COALESCE(u.name || ' ' || COALESCE(u.surname, ''), u.email),
            'role', ar.name,
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
