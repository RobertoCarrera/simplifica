CREATE OR REPLACE FUNCTION public.debug_client_modules(p_auth_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_found_client record;
    v_modules jsonb;
BEGIN
    SELECT * INTO v_found_client FROM public.clients WHERE auth_user_id = p_auth_user_id;
    
    SELECT jsonb_agg(
            jsonb_build_object(
                'key', m.key,
                'name', m.label,
                'enabled', (cm.status = 'active')
            ) ORDER BY m.key
        ) INTO v_modules
        FROM public.modules_catalog m
        LEFT JOIN public.company_modules cm 
            ON m.key = cm.module_key 
            AND cm.company_id = v_found_client.company_id;

    RETURN jsonb_build_object(
        'client', row_to_json(v_found_client),
        'modules', v_modules
    );
END;
$function$;