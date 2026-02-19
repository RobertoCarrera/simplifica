-- Fix employee effective modules to inherit from Company Owner
-- Date: 2026-01-11 02:00:01

CREATE OR REPLACE FUNCTION public.get_effective_modules(p_input_company_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    result jsonb;
    v_auth_user_id uuid;
    v_public_user_id uuid;
    v_global_role text; -- To capture global admin role
    v_target_company_id uuid;
    v_membership_role text;
    v_is_client boolean := false;
    v_has_user_modules boolean := false;
    v_owner_user_id uuid; -- To find the owner's ID
BEGIN
    v_auth_user_id := auth.uid();
    
    -- Check for Global Admin (Super Admin)
    select u.id, ar.name into v_public_user_id, v_global_role
    from public.users u
    left join public.app_roles ar on u.app_role_id = ar.id
    where u.auth_user_id = v_auth_user_id;

    -- 1. Determine Target Company Context (Same logic as before)
    if p_input_company_id is not null then
        v_target_company_id := p_input_company_id;
        
        -- Check Membership
        select ar.name into v_membership_role from public.company_members cm left join public.app_roles ar on cm.role_id = ar.id
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
        else
            -- Try to find an active company for this staff user
            select company_id, role into v_target_company_id, v_membership_role
            from public.company_members
            where user_id = v_public_user_id
            and status = 'active'
            limit 1;
        end if;
    end if;

    -- 2. LOGIC: STAFF / SUPER ADMIN
    if v_public_user_id is not null and not v_is_client then
        
        -- Default to checking the current user's config
        v_owner_user_id := v_public_user_id;

        -- IF current user is an employee (not owner, not global admin),
        -- Use the Company OWNER's configuration instead.
        if v_membership_role IN ('admin', 'member', 'professional', 'agent') and v_global_role != 'admin' and v_target_company_id is not null then
            
            -- Find the first owner of this company
            select user_id into v_owner_user_id
            from public.company_members
            where company_id = v_target_company_id
            and role = 'owner'
            and status = 'active'
            limit 1;

            -- Fallback: If no owner found (weird), stick to self (which will likely default false) or force true?
            if v_owner_user_id is null then
                 v_owner_user_id := v_public_user_id;
            end if;
        end if;

        -- Check if TARGET USER (Owner or Self) has explicit configuration
        select exists(select 1 from public.user_modules where user_id = v_owner_user_id)
        into v_has_user_modules;

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
                        when v_global_role = 'admin' and not v_has_user_modules and v_owner_user_id = v_public_user_id then
                            true
                        -- Case C: Owner (or Inherited Owner) & No Config -> Enable All (Default)
                        when not v_has_user_modules then
                           true
                        -- Default: Disabled (Should not happen if Case C catches "No Config")
                        else false
                    end
                )
            ) ORDER BY m.key
        ) INTO result
        FROM public.modules_catalog m
        LEFT JOIN public.user_modules um
            ON m.key = um.module_key
            AND um.user_id = v_owner_user_id; -- Join on the TARGET user (Owner)

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
$function$;
