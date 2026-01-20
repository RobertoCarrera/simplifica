-- Migration: Fix RPC user lookup (use auth_user_id)
-- Date: 2026-01-11 13:30:00

-- 1. Update admin_list_companies
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
    WHERE u.auth_user_id = auth.uid(); -- FIX: Use auth_user_id

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
    WHERE u.auth_user_id = auth.uid(); -- FIX: Use auth_user_id
    
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
    WHERE u.auth_user_id = auth.uid(); -- FIX: Use auth_user_id
    
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

-- 4. Fix is_super_admin (Just in case, though it's less critical now)
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Strict check: USER ID or AUTH_USER_ID + SUPER ADMIN ROLE ID
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    WHERE (u.auth_user_id = user_id OR u.id = user_id)
    AND u.app_role_id = '193d8af6-e24e-47ff-944a-bb8176a412ab'
  );
END;
$$;
