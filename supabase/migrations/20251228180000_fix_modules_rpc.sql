-- Fix get_effective_modules to resolve public user ID from Auth ID
CREATE OR REPLACE FUNCTION public.get_effective_modules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    result jsonb;
    v_auth_user_id uuid;
    v_public_user_id uuid;
BEGIN
    v_auth_user_id := auth.uid();
    
    -- Resolve public user id from auth id
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_user_id = v_auth_user_id;

    -- If the user is not found in public.users, we can't find their modules
    -- (This handles the case where the session exists but the public profile is missing)
    IF v_public_user_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'key', mc.key,
            'name', mc.label,
            'enabled', (
                um.status IS NOT NULL AND 
                LOWER(um.status::text) IN ('activado', 'active', 'enabled')
            )
        ) ORDER BY mc.key
    ) INTO result
    FROM public.modules_catalog mc
    LEFT JOIN public.user_modules um 
        ON mc.key = um.module_key 
        AND um.user_id = v_public_user_id; -- Correctly use the PUBLIC user id

    RETURN COALESCE(result, '[]'::jsonb);
END;
$function$;
