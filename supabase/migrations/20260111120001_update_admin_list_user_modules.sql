CREATE OR REPLACE FUNCTION public.admin_list_user_modules(p_owner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_role text;
    v_target_company_id uuid;
    v_users jsonb;
    v_modules jsonb;
    v_assignments jsonb;
BEGIN
    -- Security: Get caller's role directly
    SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
    
    -- Allow super_admin to access this function as well
    -- (Assuming super_admin should have access, though originally it checked 'owner' or 'admin')
    -- For now, we keep the check simple but rely on RLS/PermissionsService for higher level access control if needed.
    -- But since this is SECURITY DEFINER, we should be careful.
    -- Let's check against public.users.role (legacy) OR check if they are super_admin via app_roles.
    -- However, for this specific function used in Modules Admin, the existing check was:
    -- IF v_user_role NOT IN ('owner', 'admin') THEN ...
    
    -- We'll keep the existing check for now to minimize disruption, but arguably super_admin should be allowed.
    -- Note: super_admin usually has role='super_admin' or 'owner' in legacy column? 
    -- If migrate script didn't update legacy role to 'super_admin' (it kept 'owner' for compatibility), then this works.
    
    IF v_user_role NOT IN ('owner', 'admin', 'super_admin') THEN
         -- Optional: Verify if strictly super_admin via app_role if legacy role is something else?
         -- For now, trust the legacy role or if we explicitly updated it.
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
$function$
;
