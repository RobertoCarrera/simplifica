-- Migration to enable standard Client Portal modules for all client users
-- Created on 2025-12-31-1900

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
        -- FORCE ENABLE STANDARD CLIENT PORTAL MODULES
        -- We explicitly enable the modules that have client-facing features.
        -- We assume that if the company is using Simplifica, the client should see these sections
        -- if the global module system allows it.
        
        -- Current Standard Client Modules:
        -- moduloSAT (Tickets & Devices)
        -- moduloPresupuestos (Quotes)
        -- moduloFacturas (Invoices)
        -- moduloServicios (Services)
        
        RETURN jsonb_build_array(
            jsonb_build_object('key', 'moduloSAT', 'name', 'Soporte Técnico', 'enabled', true),
            jsonb_build_object('key', 'moduloPresupuestos', 'name', 'Presupuestos', 'enabled', true),
            jsonb_build_object('key', 'moduloFacturas', 'name', 'Facturación', 'enabled', true),
            jsonb_build_object('key', 'moduloServicios', 'name', 'Servicios', 'enabled', true)
        );
    END IF;

    -- 3. Fallback: User not found
    RETURN '[]'::jsonb;
END;
$$;
