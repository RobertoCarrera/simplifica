-- Migration: Refactor get_effective_modules to use company_modules
-- Date: 2026-01-11 13:40:00

CREATE OR REPLACE FUNCTION public.get_effective_modules(p_input_company_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    result jsonb;
    v_auth_user_id uuid;
    v_public_user_id uuid;
    v_global_role_name text; 
    v_target_company_id uuid;
    v_membership_role text;
    v_is_client boolean := false;
BEGIN
    v_auth_user_id := auth.uid();
    
    -- Check for Global Admin (Super Admin) using app_roles (Fixing lookup to use auth_user_id)
    select u.id, ar.name, u.company_id 
    into v_public_user_id, v_global_role_name, v_target_company_id 
    from public.users u
    left join public.app_roles ar on u.app_role_id = ar.id
    where u.auth_user_id = v_auth_user_id;

    -- 1. Determine Target Company Context
    if p_input_company_id is not null then
        v_target_company_id := p_input_company_id;
        
        -- Check Membership (Staff)
        select cm.role into v_membership_role
        from public.company_members cm
        where cm.user_id = v_public_user_id
          and cm.company_id = v_target_company_id
          and cm.status = 'active';
          
        if v_membership_role is null then
             -- NOT STAFF: Check Client
             perform 1 from public.clients
             where auth_user_id = v_auth_user_id
               and company_id = v_target_company_id
               and is_active = true;
             if found then
                v_is_client := true;
             end if;
        end if;
    else
        -- No input company? Use user's company (Staff default)
        -- (Already fetched above in initial query)
        IF v_target_company_id IS NULL THEN
            -- Check if client without user record (pure client)
             select company_id into v_target_company_id 
             from public.clients
             where auth_user_id = v_auth_user_id
               and is_active = true
             limit 1;
             
             if v_target_company_id is not null then
                v_is_client := true;
             end if;
        END IF;
    end if;

    -- If Super Admin (Global), they see everything enabled always
    if v_global_role_name = 'super_admin' then
        SELECT jsonb_agg(
            jsonb_build_object(
                'key', m.key,
                'name', m.label,
                'enabled', true
            ) ORDER BY m.key
        ) INTO result
        FROM public.modules_catalog m;
        RETURN COALESCE(result, '[]'::jsonb);
    end if;

    -- 2. LOGIC: STAFF & CLIENTS -> Use company_modules
    -- Both staff and clients should see modules enabled for the target company.
    -- Frontend handles filtering which specific modules are "Client Facing".
    if v_target_company_id is not null then
        SELECT jsonb_agg(
            jsonb_build_object(
                'key', m.key,
                'name', m.label,
                'enabled', (
                    -- Strict check against company_modules
                    -- If status is 'active', it's enabled.
                    -- If status is 'inactive' or NULL (no record), it's disabled.
                    COALESCE(cm.status, 'inactive') = 'active'
                )
            ) ORDER BY m.key
        ) INTO result
        FROM public.modules_catalog m
        LEFT JOIN public.company_modules cm
            ON m.key = cm.module_key
            AND cm.company_id = v_target_company_id;

        RETURN COALESCE(result, '[]'::jsonb);
    end if;

    -- Default: No access
    RETURN '[]'::jsonb;
END;
$function$;
