-- Migration to fix admin_list_user_modules to return JSONB matching frontend expectations
-- Frontend expects: { users: [], modules: [], assignments: [] }

DROP FUNCTION IF EXISTS public.admin_list_user_modules(uuid);

CREATE OR REPLACE FUNCTION public.admin_list_user_modules(p_owner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_company_id uuid;
    v_users jsonb;
    v_modules jsonb;
    v_assignments jsonb;
BEGIN
    -- 1. Determine Company
    -- Security: Always use the auth user's company for now to prevent leaking data across companies.
    -- If p_owner_id is provided, we could check if it belongs to the same company, but simpler to just use auth context.
    SELECT company_id INTO v_company_id FROM public.users WHERE id = auth.uid();
    
    IF v_company_id IS NULL THEN
         RAISE EXCEPTION 'User has no company';
    END IF;

    -- Basic Role Check
    IF NOT public.check_user_role(auth.uid(), 'owner') AND NOT public.check_user_role(auth.uid(), 'admin') THEN
       RAISE EXCEPTION 'Access denied';
    END IF;

    -- 2. Fetch Users
    -- Frontend expects: id, email, name, role, active
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
    WHERE u.company_id = v_company_id;

    -- 3. Fetch Modules
    -- Frontend expects: key, label (as name in frontend map)
    -- We assume public.modules_catalog exists based on get_effective_modules usage
    SELECT jsonb_agg(
        jsonb_build_object(
            'key', m.key,
            'name', m.label -- Frontend maps this .name to label
        ) ORDER BY m.position ASC
    ) INTO v_modules
    FROM public.modules_catalog m;

    -- 4. Fetch Assignments
    -- Frontend expects: user_id, module_key, status
    SELECT jsonb_agg(
        jsonb_build_object(
            'user_id', um.user_id,
            'module_key', um.module_key,
            'status', um.status
        )
    ) INTO v_assignments
    FROM public.user_modules um
    WHERE um.user_id IN (SELECT id FROM public.users WHERE company_id = v_company_id);

    -- 5. Build Result
    RETURN jsonb_build_object(
        'users', COALESCE(v_users, '[]'::jsonb),
        'modules', COALESCE(v_modules, '[]'::jsonb),
        'assignments', COALESCE(v_assignments, '[]'::jsonb)
    );
END;
$$;
