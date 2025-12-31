-- Migration to update get_effective_modules to support client portal users
-- Created on 2025-12-31

CREATE OR REPLACE FUNCTION "public"."get_effective_modules"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result jsonb;
    v_auth_user_id uuid;
    v_public_user_id uuid;
    v_client_company_id uuid;
    v_owner_user_id uuid;
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
                'name', m.label, -- Use label from modules_catalog
                'enabled', (
                    um.status IS NOT NULL AND 
                    LOWER(um.status::text) IN ('activado', 'active', 'enabled')
                )
            ) ORDER BY m.key
        ) INTO result
        FROM public.modules_catalog m -- Use modules_catalog instead of modules
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
        -- Find the OWNER of this company to inherit modules from.
        -- (Assuming modules are purchased/assigned at company level via the Owner)
        SELECT id INTO v_owner_user_id
        FROM public.users
        WHERE company_id = v_client_company_id 
          AND role = 'owner'
        LIMIT 1;

        IF v_owner_user_id IS NOT NULL THEN
             SELECT jsonb_agg(
                jsonb_build_object(
                    'key', m.key,
                    'name', m.label, -- Use label from modules_catalog
                    'enabled', (
                        um.status IS NOT NULL AND 
                        LOWER(um.status::text) IN ('activado', 'active', 'enabled')
                    )
                ) ORDER BY m.key
            ) INTO result
            FROM public.modules_catalog m -- Use modules_catalog instead of modules
            LEFT JOIN public.user_modules um 
                ON m.key = um.module_key 
                AND um.user_id = v_owner_user_id; -- Use OWNER's modules for the client

            RETURN COALESCE(result, '[]'::jsonb);
        END IF;
    END IF;

    -- 3. Fallback: User not found or no company owner found
    RETURN '[]'::jsonb;
END;
$$;

ALTER FUNCTION "public"."get_effective_modules"() OWNER TO "postgres";
