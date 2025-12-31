-- Migration to update get_effective_modules to use company_settings for clients (Source of Truth)
-- Created on 2025-12-31

CREATE OR REPLACE FUNCTION "public"."get_effective_modules"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result jsonb;
    v_auth_user_id uuid;
    v_public_user_id uuid;
    v_client_company_id uuid;
BEGIN
    v_auth_user_id := auth.uid();

    -- 1. Try to resolve public user id from auth id (Employees/Admins/Owners)
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_user_id = v_auth_user_id;

    -- If found in users table, use standard logic (fetch their own assigned modules)
    IF v_public_user_id IS NOT NULL THEN
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
    END IF;

    -- 2. If not in users, check if it's a Client (Portal User)
    SELECT company_id INTO v_client_company_id
    FROM public.clients
    WHERE auth_user_id = v_auth_user_id;

    -- If found in clients table
    IF v_client_company_id IS NOT NULL THEN
        -- Use company_settings.agent_module_access as the source of truth
        -- This JSONB array contains the keys of modules enabled for the company
        
        SELECT jsonb_agg(
            jsonb_build_object(
                'key', m.key,
                'name', m.label,
                'enabled', true -- If it's in agent_module_access, it is enabled
            ) ORDER BY m.key
        ) INTO result
        FROM public.company_settings cs
        CROSS JOIN jsonb_array_elements_text(cs.agent_module_access) as access_key
        JOIN public.modules_catalog m ON m.key = access_key
        WHERE cs.company_id = v_client_company_id;

        RETURN COALESCE(result, '[]'::jsonb);
    END IF;

    -- 3. Fallback: User not found
    RETURN '[]'::jsonb;
END;
$$;
