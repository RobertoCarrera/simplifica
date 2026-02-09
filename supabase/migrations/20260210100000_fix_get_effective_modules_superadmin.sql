-- Fix get_effective_modules to grant all modules to super_admins
CREATE OR REPLACE FUNCTION public.get_effective_modules(p_input_company_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
    result jsonb;
    v_auth_user_id uuid;
    v_public_user_id uuid;
    v_target_company_id uuid;
    v_membership_role text;
    v_global_role text;
    v_is_client boolean := false;
begin
    v_auth_user_id := auth.uid();
    
    -- 1. Check Global Role (super_admin has access to everything)
    select ar.name into v_global_role
    from public.users u
    left join public.app_roles ar on ar.id = u.app_role_id
    where u.auth_user_id = v_auth_user_id;

    if v_global_role = 'super_admin' then
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

    -- 2. Normal Logic (Membership check)
    if p_input_company_id is not null then
        v_target_company_id := p_input_company_id;
        
        -- Check if Actively a Member
        select ar.name into v_membership_role
        from public.company_members cm
        join public.users u on u.id = cm.user_id
        left join public.app_roles ar on ar.id = cm.role_id
        where u.auth_user_id = v_auth_user_id
          and cm.company_id = v_target_company_id
          and cm.status = 'active';
          
        if v_membership_role is not null then
             -- IS STAFF
             select id into v_public_user_id
             from public.users
             where auth_user_id = v_auth_user_id;
        else
             -- NOT STAFF: Check if Client
             perform 1 from public.clients
             where auth_user_id = v_auth_user_id
               and company_id = v_target_company_id
               and is_active = true;
               
             if found then
                v_is_client := true;
             end if;
        end if;
        
    else
        -- NO COMPANY ID PROVIDED (Default behavior)
        select id into v_public_user_id from public.users where auth_user_id = v_auth_user_id;
        
        if v_public_user_id is null then
             select company_id into v_target_company_id
             from public.clients
             where auth_user_id = v_auth_user_id
             limit 1;
             
             if v_target_company_id is not null then
                v_is_client := true;
             end if;
        end if;
    end if;

    -- 3. LOGIC: STAFF (User Modules)
    if v_public_user_id is not null and not v_is_client then
        SELECT jsonb_agg(
            jsonb_build_object(
                'key', m.key,
                'name', m.label,
                'enabled', (
                    um.status IS NOT NULL AND
                    LOWER(um.status::text) IN ('activado', 'active', 'enabled')
                )
            ) ORDER BY m.key
        ) INTO result
        FROM public.modules_catalog m
        LEFT JOIN public.user_modules um
            ON m.key = um.module_key
            AND um.user_id = v_public_user_id;

        RETURN COALESCE(result, '[]'::jsonb);
    end if;

    -- 4. LOGIC: CLIENT (Fixed Modules)
    if v_is_client then
        RETURN jsonb_build_array(
            jsonb_build_object('key', 'moduloSAT', 'name', 'Soporte Técnico', 'enabled', true),
            jsonb_build_object('key', 'moduloPresupuestos', 'name', 'Presupuestos', 'enabled', true),
            jsonb_build_object('key', 'moduloFacturas', 'name', 'Facturación', 'enabled', true),
            jsonb_build_object('key', 'moduloServicios', 'name', 'Servicios', 'enabled', true)
        );
    end if;

    -- 5. Fallback: Empty
    RETURN '[]'::jsonb;
END;
$function$;
