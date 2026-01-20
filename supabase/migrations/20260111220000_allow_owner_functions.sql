-- Migration: Allow Owners to access admin module functions
-- Date: 2026-01-11 13:00:00

-- 1. Update admin_list_companies
-- Super Admin -> All companies
-- Owner -> Only their own company
CREATE OR REPLACE FUNCTION public.admin_list_companies()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role_name text;
    v_user_company_id uuid;
    v_companies jsonb;
BEGIN
    SELECT r.name, u.company_id 
    INTO v_user_role_name, v_user_company_id
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
    WHERE u.id = auth.uid();

    -- Allow Super Admin OR Owner
    IF v_user_role_name IS NULL OR (v_user_role_name != 'super_admin' AND v_user_role_name != 'owner') THEN
         RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'created_at', c.created_at,
            'subscription_tier', c.subscription_tier,
            'is_active', c.is_active
        ) ORDER BY c.name ASC
    ) INTO v_companies
    FROM public.companies c
    WHERE 
        -- Super Admin sees all
        v_user_role_name = 'super_admin'
        OR
        -- Owner sees only own company
        (v_user_role_name = 'owner' AND c.id = v_user_company_id);

    RETURN jsonb_build_object('companies', COALESCE(v_companies, '[]'::jsonb));
END;
$$;


-- 2. Update admin_list_company_modules
-- Allow matching company_id for Owners
CREATE OR REPLACE FUNCTION public.admin_list_company_modules(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_modules JSONB;
    v_user_role_name text;
    v_user_company_id uuid;
BEGIN
    SELECT r.name, u.company_id 
    INTO v_user_role_name, v_user_company_id
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
    WHERE u.id = auth.uid();
    
    -- Check permissions
    IF v_user_role_name = 'super_admin' THEN
        -- OK
    ELSIF v_user_role_name = 'owner' AND v_user_company_id = p_company_id THEN
        -- OK (Owner managing own company)
    ELSE
        RAISE EXCEPTION 'Access Denied: Insufficient permissions';
    END IF;
    
    SELECT jsonb_agg(
        jsonb_build_object(
            'key', mc.key,
            'label', mc.label,
            'status', COALESCE(cm.status, 'inactive')
        )
    )
    INTO v_modules
    FROM public.modules_catalog mc
    LEFT JOIN public.company_modules cm 
        ON mc.key = cm.module_key AND cm.company_id = p_company_id;

    RETURN jsonb_build_object('modules', COALESCE(v_modules, '[]'::jsonb));
END;
$$;


-- 3. Update admin_toggle_company_module
-- Allow matching company_id for Owners
CREATE OR REPLACE FUNCTION public.admin_toggle_company_module(
    p_company_id UUID,
    p_module_key TEXT,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role_name text;
    v_user_company_id uuid;
BEGIN
    SELECT r.name, u.company_id 
    INTO v_user_role_name, v_user_company_id
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
    WHERE u.id = auth.uid();
    
    -- Check permissions
    IF v_user_role_name = 'super_admin' THEN
        -- OK
    ELSIF v_user_role_name = 'owner' AND v_user_company_id = p_company_id THEN
        -- OK (Owner managing own company)
    ELSE
        RAISE EXCEPTION 'Access Denied: Insufficient permissions';
    END IF;

    IF p_status NOT IN ('active', 'inactive') THEN
         RAISE EXCEPTION 'Invalid status. Must be active or inactive';
    END IF;

    INSERT INTO public.company_modules (company_id, module_key, status, updated_at)
    VALUES (p_company_id, p_module_key, p_status, now())
    ON CONFLICT (company_id, module_key)
    DO UPDATE SET status = EXCLUDED.status, updated_at = now();

    RETURN jsonb_build_object('success', true);
END;
$$;
