-- 1. FIX: admin_list_owners RPC (Correct column names)
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
                    -- Schema has 'name' and 'surname', not first_name/last_name
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

-- 2. FIX: admin_list_user_modules (Correct column names + Graceful No-Company Handling)
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
        -- If target owner has no company, we can't show company modules.
        IF v_target_company_id IS NULL THEN
             RETURN jsonb_build_object('users', '[]'::jsonb, 'modules', '[]'::jsonb, 'assignments', '[]'::jsonb);
        END IF;
    ELSE
        -- Default to auth user's company
        SELECT company_id INTO v_target_company_id FROM public.users WHERE id = auth.uid();
        -- If current user has no company (e.g. Super Admin), return empty instead of error
        IF v_target_company_id IS NULL THEN
             RETURN jsonb_build_object('users', '[]'::jsonb, 'modules', '[]'::jsonb, 'assignments', '[]'::jsonb);
        END IF;
    END IF;

    -- Basic Role Check
    IF NOT public.check_user_role(auth.uid(), 'owner') AND NOT public.check_user_role(auth.uid(), 'admin') THEN
       RAISE EXCEPTION 'Access denied';
    END IF;

    -- 2. Fetch Users of that company
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', u.id,
            'email', u.email,
            -- Corrected name columns
            'name', COALESCE(u.name || ' ' || COALESCE(u.surname, ''), u.email),
            'role', u.role,
            'active', COALESCE(u.active, true) -- Schema has 'active' (bool) or check is_active? let's safely coalesce
        )
    ) INTO v_users
    FROM public.users u
    WHERE u.company_id = v_target_company_id;

    -- 3. Fetch Modules
    SELECT jsonb_agg(
        jsonb_build_object(
            'key', m.key,
            'name', m.label
        ) ORDER BY m.position ASC
    ) INTO v_modules
    FROM public.modules_catalog m;

    -- 4. Fetch Assignments
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
