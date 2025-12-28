-- Fix get_config_units RPC ordering (move ORDER BY inside jsonb_agg)
CREATE OR REPLACE FUNCTION public.get_config_units()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_user_id uuid;
    result jsonb;
BEGIN
    v_user_id := auth.uid();
    
    -- Get user's company (try users table first)
    SELECT company_id INTO v_company_id FROM public.users WHERE auth_user_id = v_user_id;
    
    -- If not found, try clients (though typically config is for dashboard users)
    IF v_company_id IS NULL THEN
        SELECT company_id INTO v_company_id FROM public.clients WHERE auth_user_id = v_user_id;
    END IF;

    -- Return units combined with is_hidden flag
    SELECT jsonb_agg(
        to_jsonb(u) || jsonb_build_object('is_hidden', (hu.unit_id IS NOT NULL))
        ORDER BY u.name ASC
    ) INTO result
    FROM public.service_units u
    LEFT JOIN public.hidden_units hu ON u.id = hu.unit_id AND hu.company_id = v_company_id
    WHERE (u.company_id IS NULL OR u.company_id = v_company_id)
    AND (u.deleted_at IS NULL);

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
