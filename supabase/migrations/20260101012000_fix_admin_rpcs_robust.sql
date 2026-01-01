-- Final robust fix for admin RPCs (Corrected variable assignment)

-- 1. admin_list_owners
CREATE OR REPLACE FUNCTION public.admin_list_owners()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN jsonb_build_object(
        'owners', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', u.id,
                    'email', u.email,
                    'name', COALESCE(u.name || ' ' || COALESCE(u.surname, ''), u.email),
                    'company_id', u.company_id
                )
            )
            FROM public.users u
            WHERE u.role = 'owner'
        )
    );
END;
$$;

-- 2. admin_list_user_modules
CREATE OR REPLACE FUNCTION public.admin_list_user_modules(p_owner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_role text;
    v_target_company_id uuid;
    v_users jsonb;
    v_modules jsonb;
    v_assignments jsonb;
BEGIN
    -- Security: Get caller's role directly
    SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
    
    IF v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Determine Target Company
    IF p_owner_id IS NOT NULL THEN
        SELECT company_id INTO v_target_company_id FROM public.users WHERE id = p_owner_id;
        IF v_target_company_id IS NULL THEN
             RETURN jsonb_build_object('users', '[]'::jsonb, 'modules', '[]'::jsonb, 'assignments', '[]'::jsonb);
        END IF;
    ELSE
        SELECT company_id INTO v_target_company_id FROM public.users WHERE id = auth.uid();
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
            'role', u.role,
            'active', COALESCE(u.active, true)
        )
    ) INTO v_users
    FROM public.users u
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
$$;
