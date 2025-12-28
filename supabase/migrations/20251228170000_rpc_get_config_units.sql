-- 1. Ensure hidden_units table exists
CREATE TABLE IF NOT EXISTS public.hidden_units (
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    unit_id uuid NOT NULL REFERENCES public.service_units(id) ON DELETE CASCADE,
    hidden_by uuid REFERENCES public.users(id),
    created_at timestamptz DEFAULT now(),
    PRIMARY KEY (company_id, unit_id)
);

ALTER TABLE public.hidden_units ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view/modify hidden units for THEIR company
CREATE POLICY "Users can manage hidden units for their company" ON public.hidden_units
    USING (company_id IN (
        SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
    ))
    WITH CHECK (company_id IN (
        SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()
    ));

-- 2. RPC to get config units (replacing get-config-units Edge Function)
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
    ) INTO result
    FROM public.service_units u
    LEFT JOIN public.hidden_units hu ON u.id = hu.unit_id AND hu.company_id = v_company_id
    WHERE (u.company_id IS NULL OR u.company_id = v_company_id)
    AND (u.deleted_at IS NULL)
    ORDER BY u.name;

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- 3. RPC to toggle unit visibility (replacing hide-unit Edge Function)
CREATE OR REPLACE FUNCTION public.toggle_unit_visibility(p_unit_id uuid, p_operation text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_user_id uuid;
    v_app_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    SELECT company_id, id INTO v_company_id, v_app_user_id 
    FROM public.users 
    WHERE auth_user_id = v_user_id;
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'User not associated with a company or not found in users table';
    END IF;

    IF p_operation = 'hide' THEN
        INSERT INTO public.hidden_units (company_id, unit_id, hidden_by)
        VALUES (v_company_id, p_unit_id, v_app_user_id)
        ON CONFLICT (company_id, unit_id) DO NOTHING;
    ELSIF p_operation = 'unhide' THEN
        DELETE FROM public.hidden_units
        WHERE company_id = v_company_id AND unit_id = p_unit_id;
    ELSE
        RAISE EXCEPTION 'Invalid operation: %', p_operation;
    END IF;
END;
$$;
