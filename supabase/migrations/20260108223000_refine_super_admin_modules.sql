-- Refine super admin modules to respect user preferences
-- Date: 2026-01-08 22:30:00

create or replace function public.get_effective_modules(p_input_company_id uuid default null)
returns jsonb
language plpgsql
security definer
as $$
declare
    result jsonb;
    v_auth_user_id uuid;
    v_public_user_id uuid;
    v_global_role text; -- To capture global admin role
    v_target_company_id uuid;
    v_membership_role text;
    v_is_client boolean := false;
    v_has_user_modules boolean := false;
begin
    v_auth_user_id := auth.uid();
    
    -- Check for Global Admin (Super Admin)
    select id, role into v_public_user_id, v_global_role
    from public.users 
    where auth_user_id = v_auth_user_id;

    -- 1. Determine Target Company Context (Same logic as before)
    if p_input_company_id is not null then
        v_target_company_id := p_input_company_id;
        
        -- Check Membership
        select cm.role into v_membership_role
        from public.company_members cm
        where cm.user_id = v_public_user_id
          and cm.company_id = v_target_company_id
          and cm.status = 'active';
          
        if v_membership_role is not null then
             -- IS STAFF
        else
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
        -- Logic when no company ID (fallback)
        if v_public_user_id is null then
             select company_id into v_target_company_id
             from public.clients
             where auth_user_id = v_auth_user_id
             limit 1;
             if v_target_company_id is not null then v_is_client := true; end if;
        end if;
    end if;

    -- 2. LOGIC: STAFF / SUPER ADMIN
    if v_public_user_id is not null and not v_is_client then
        
        -- Check if user has ANY explicit configuration in user_modules
        select exists(select 1 from public.user_modules where user_id = v_public_user_id)
        into v_has_user_modules;

        -- If Super Admin AND NO configuration -> Enable All (Default)
        -- If Super Admin AND HAS configuration -> Respect configuration
        -- If Normal User -> Respect configuration (default false if missing, unless Owner handled later)

        SELECT jsonb_agg(
            jsonb_build_object(
                'key', m.key,
                'name', m.label,
                'enabled', (
                    case 
                        -- Case A: Explicit entry exists -> Use it
                        when um.status is not null then
                            LOWER(um.status::text) IN ('activado', 'active', 'enabled')
                        -- Case B: Super Admin & No Config -> Enable All
                        when v_global_role = 'admin' and not v_has_user_modules then
                            true
                        -- Case C: Owner & No Config -> Enable All (Legacy Owner Drift)
                        when v_membership_role = 'owner' and not v_has_user_modules then
                           true
                        -- Default: Disabled
                        else false
                    end
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
        RETURN jsonb_build_array(
            jsonb_build_object('key', 'moduloSAT', 'name', 'Soporte Técnico', 'enabled', true),
            jsonb_build_object('key', 'moduloPresupuestos', 'name', 'Presupuestos', 'enabled', true),
            jsonb_build_object('key', 'moduloFacturas', 'name', 'Facturación', 'enabled', true),
            jsonb_build_object('key', 'moduloServicios', 'name', 'Servicios', 'enabled', true)
        );
    end if;

    RETURN '[]'::jsonb;
END;
$$;
