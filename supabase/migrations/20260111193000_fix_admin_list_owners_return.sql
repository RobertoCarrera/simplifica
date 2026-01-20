-- Fix admin_list_owners to return { owners: [...] } object instead of array
-- This matches SupabaseModulesService expectation: return data as { owners: any[] }

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
            'company_id', u.company_id,
            'company_name', c.name
        ) ORDER BY c.name ASC NULLS LAST
    ) INTO v_owners
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    LEFT JOIN public.companies c ON u.company_id = c.id
    WHERE ar.name = 'owner';

    -- FIX: Return object wrapper
    RETURN jsonb_build_object('owners', COALESCE(v_owners, '[]'::jsonb));
END;
$function$;
