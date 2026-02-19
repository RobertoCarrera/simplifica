-- Restore Global Admin (Super Admin) support in get_effective_modules
-- Date: 2026-01-08 21:00:00

create or replace function public.get_effective_modules(p_input_company_id uuid default null)
returns jsonb
language plpgsql
security definer
as $$
declare
    result jsonb;
    v_auth_user_id uuid;
    v_public_user_id uuid;
    v_target_company_id uuid;
    v_membership_role text;
    v_global_role text; -- New variable for user's global role
    v_is_client boolean := false;
    v_is_super_admin boolean := false;
begin
    v_auth_user_id := auth.uid();

    -- 0. Check for Global Admin (Super Admin)
    select u.id, ar.name into v_public_user_id, v_global_role
    from public.users u
    left join public.app_roles ar on u.app_role_id = ar.id
    where u.auth_user_id = v_auth_user_id;

    if v_global_role = 'admin' then
        v_is_super_admin := true;
    end if;
    
    -- 1. Determine Target Company Context
    
    if p_input_company_id is not null then
        v_target_company_id := p_input_company_id;
        
        -- Check if Actively a Member (Owner/Admin/Member)
        select ar.name into v_membership_role from public.company_members cm left join public.app_roles ar on cm.role_id = ar.id
        from public.company_members cm
        where cm.user_id = v_public_user_id
          and cm.company_id = v_target_company_id
          and cm.status = 'active';
          
        if v_membership_role is not null or v_is_super_admin then
             -- IS STAFF (or Super Admin masquerading/viewing)
             -- v_public_user_id is already set
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
        -- NO COMPANY ID PROVIDED (Legacy/Default behavior)
        if v_public_user_id is not null then
            -- Default assumption if not provided
            v_membership_role := 'member'; 
        end if;
        
        if v_public_user_id is null then
            -- Fallback client check
             select company_id into v_target_company_id
             from public.clients
             where auth_user_id = v_auth_user_id
             limit 1;
             
             if v_target_company_id is not null then
                v_is_client := true;
             end if;
        end if;
    end if;

    -- 2. LOGIC: STAFF (User Modules) or SUPER ADMIN
    if (v_public_user_id is not null and not v_is_client) or v_is_super_admin then
        SELECT jsonb_agg(
            jsonb_build_object(
                'key', m.key,
                'name', m.label,
                'enabled', (
                    CASE 
                        -- Super Admin always enabled (or checking user_modules if we want to allow toggling even for SA?)
                        -- User request implies SA manages modules, so likely they should see them enabled OR reflect the config.
                        -- But since SA might not have a specific 'user_modules' entry for this company, we default to TRUE.
                        WHEN v_is_super_admin THEN TRUE
                        -- Exact match in user_modules
                        WHEN um.status IS NOT NULL THEN LOWER(um.status::text) IN ('activado', 'active', 'enabled')
                        -- No record found: Default to TRUE for Owners/Admins
                        WHEN v_membership_role IN ('owner', 'admin') THEN TRUE
                        ELSE FALSE
                    END
                )
            ) ORDER BY m.key
        ) INTO result
        FROM public.modules_catalog m
        LEFT JOIN public.user_modules um
            ON m.key = um.module_key
            AND um.user_id = v_public_user_id;

        RETURN COALESCE(result, '[]'::jsonb);
    end if;

    -- 3. LOGIC: CLIENT (Fixed Modules)
    if v_is_client then
        -- HARDCODED CLIENT MODULES (Standard)
        RETURN jsonb_build_array(
            jsonb_build_object('key', 'moduloSAT', 'name', 'Soporte Técnico', 'enabled', true),
            jsonb_build_object('key', 'moduloPresupuestos', 'name', 'Presupuestos', 'enabled', true),
            jsonb_build_object('key', 'moduloFacturas', 'name', 'Facturación', 'enabled', true),
            jsonb_build_object('key', 'moduloServicios', 'name', 'Servicios', 'enabled', true)
        );
    end if;

    -- 4. Fallback: Empty
    RETURN '[]'::jsonb;
END;
$$;
