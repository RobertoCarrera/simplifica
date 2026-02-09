-- Migration: Fix User Roles and Admin Access
-- Description: Assigns missing app_role_id to special users and ensures Roberto is Super Admin.

-- 1. Get role IDs for mapping
DO $$
DECLARE
    v_role_super_admin UUID;
    v_role_owner UUID;
    v_role_member UUID;
BEGIN
    SELECT id INTO v_role_super_admin FROM public.app_roles WHERE name = 'super_admin';
    SELECT id INTO v_role_owner FROM public.app_roles WHERE name = 'owner';
    SELECT id INTO v_role_member FROM public.app_roles WHERE name = 'member';

    -- 2. Fix Roberto (Email: roberto@simplificacrm.es)
    UPDATE public.users 
    SET app_role_id = v_role_super_admin 
    WHERE email = 'roberto@simplificacrm.es';

    -- 3. Fix other users with NULL app_role_id
    -- admin@simplifica.com -> super_admin (assumed based on email)
    UPDATE public.users SET app_role_id = v_role_super_admin WHERE email = 'admin@simplifica.com' AND app_role_id IS NULL;
    
    -- fisioterapia@caibs.es -> member (default)
    UPDATE public.users SET app_role_id = v_role_member WHERE email = 'fisioterapia@caibs.es' AND app_role_id IS NULL;
    
    -- test@example.com -> member (default)
    UPDATE public.users SET app_role_id = v_role_member WHERE email = 'test@example.com' AND app_role_id IS NULL;

    -- 4. Fallback for any other NULL roles (assign 'member' as safest default)
    UPDATE public.users SET app_role_id = v_role_member WHERE app_role_id IS NULL;

END $$;

-- 5. Re-apply admin_list_companies to ensure it has the correct permissions check
-- This function allows Super Admin to see everything and Owners to see their own company.
CREATE OR REPLACE FUNCTION public.admin_list_companies()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_role_name text;
    v_user_company_id uuid;
    v_companies jsonb;
BEGIN
    -- Security Check: Join with app_roles
    SELECT r.name, u.company_id 
    INTO v_user_role_name, v_user_company_id
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
    WHERE u.auth_user_id = auth.uid();

    -- Allow Super Admin OR Owner
    IF v_user_role_name IS NULL OR (v_user_role_name != 'super_admin' AND v_user_role_name != 'owner') THEN
         RAISE EXCEPTION 'Access denied';
    END IF;

    -- Fetch companies with their respective module status
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'settings', c.settings,
            'subscription_tier', c.subscription_tier,
            'is_active', c.is_active,
            'modules', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'key', mc.key,
                        'label', mc.label,
                        'status', COALESCE(cm.status, 'inactive')
                    ) ORDER BY mc.key ASC
                )
                FROM public.modules_catalog mc
                LEFT JOIN public.company_modules cm 
                    ON cm.module_key = mc.key 
                    AND cm.company_id = c.id
            )
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
$function$;
