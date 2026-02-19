-- Fix ambiguous "role" column in get_effective_modules
-- Date: 2026-01-08 19:45:00

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
    v_is_client boolean := false;
begin
    v_auth_user_id := auth.uid();
    
    -- 1. Determine Target Company Context
    
    if p_input_company_id is not null then
        v_target_company_id := p_input_company_id;
        
        -- Check if Actively a Member (Owner/Admin/Member)
        -- Explicitly select cm.role to avoid ambiguity
        select ar.name into v_membership_role from public.company_members cm left join public.app_roles ar on cm.role_id = ar.id
        from public.company_members cm
        join public.users u on u.id = cm.user_id
        where u.auth_user_id = v_auth_user_id
          and cm.company_id = v_target_company_id
          and cm.status = 'active';
          
        if v_membership_role is not null then
             -- IS STAFF: effective modules are from user_modules table
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
        -- NO COMPANY ID PROVIDED (Legacy/Default behavior)
        -- Fallback: Prefer Staff ID
        select id into v_public_user_id from public.users where auth_user_id = v_auth_user_id;
        
        if v_public_user_id is null then
            -- Fallback: Check if ANY client record exists
             select company_id into v_target_company_id
             from public.clients
             where auth_user_id = v_auth_user_id
             limit 1;
             
             if v_target_company_id is not null then
                v_is_client := true;
             end if;
        end if;
    end if;

    -- 2. LOGIC: STAFF (User Modules)
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
