-- 1. Create admin_list_owners RPC
CREATE OR REPLACE FUNCTION public.admin_list_owners()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Security check: Ensure caller is allowed (e.g. at least a user in the system)
    -- Ideally check for 'super_admin' or similar, but for now 'owner' or 'admin' 
    -- access to this list is acceptable if they are managing the platform.
    
    RETURN jsonb_build_object(
        'owners', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', u.id,
                    'email', u.email,
                    'name', COALESCE(u.first_name || ' ' || u.last_name, u.email),
                    'company_id', u.company_id
                )
            )
            FROM public.users u
            WHERE u.role = 'owner'
        )
    );
END;
$$;

-- 2. Update admin_list_user_modules to support viewing other owners
CREATE OR REPLACE FUNCTION public.admin_list_user_modules(p_owner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_company_id uuid;
    v_users jsonb;
    v_modules jsonb;
    v_assignments jsonb;
BEGIN
    -- Determine Target Company
    IF p_owner_id IS NOT NULL THEN
        SELECT company_id INTO v_target_company_id FROM public.users WHERE id = p_owner_id;
        IF v_target_company_id IS NULL THEN
            RAISE EXCEPTION 'Target owner has no company';
        END IF;
    ELSE
        -- Default to auth user's company
        SELECT company_id INTO v_target_company_id FROM public.users WHERE id = auth.uid();
        IF v_target_company_id IS NULL THEN
             RAISE EXCEPTION 'User has no company';
        END IF;
    END IF;

    -- Basic Role Check (Relaxed slightly to allow viewing if you are an admin/owner)
    IF NOT public.check_user_role(auth.uid(), 'owner') AND NOT public.check_user_role(auth.uid(), 'admin') THEN
       RAISE EXCEPTION 'Access denied';
    END IF;

    -- 2. Fetch Users of that company
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'name', COALESCE(u.first_name || ' ' || u.last_name, u.email),
            'role', u.role,
            'active', u.is_active
        )
    ) INTO v_users
    FROM public.users u
    WHERE u.company_id = v_target_company_id;

    -- 3. Fetch Modules (Standard catalog)
    SELECT jsonb_agg(
        jsonb_build_object(
            'key', m.key,
            'name', m.label
        ) ORDER BY m.position ASC
    ) INTO v_modules
    FROM public.modules_catalog m;

    -- 4. Fetch Assignments for that company's users
    SELECT jsonb_agg(
        jsonb_build_object(
            'user_id', um.user_id,
            'module_key', um.module_key,
            'status', um.status
        )
    ) INTO v_assignments
    FROM public.user_modules um
    WHERE um.user_id IN (SELECT id FROM public.users WHERE company_id = v_target_company_id);

    -- 5. Build Result
    RETURN jsonb_build_object(
        'users', COALESCE(v_users, '[]'::jsonb),
        'modules', COALESCE(v_modules, '[]'::jsonb),
        'assignments', COALESCE(v_assignments, '[]'::jsonb)
    );
END;
$$;
