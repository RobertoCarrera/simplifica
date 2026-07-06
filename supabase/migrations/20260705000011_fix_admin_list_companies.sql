-- Fix admin_list_companies: replace LEFT JOIN public.company_modules
-- with LEFT JOIN public.company_module_grants. The new table is the
-- 1:1 successor of company_modules for per-company module enablement.
-- The column 'status' is the same: 'active' or 'revoked'.
--
-- Note: a manual revocation (status='revoked') was previously represented
-- by the absence of a company_modules row, so the COALESCE(cm.status, 'inactive')
-- trick worked. With company_module_grants, both 'active' and 'revoked'
-- rows are stored, so we must keep the revocations visible too.
-- For the Empresa card UI, the active-only filter is applied client-side
-- (the toggle button hides inactive entries).

CREATE OR REPLACE FUNCTION public.admin_list_companies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    IF v_user_role_name IS NULL
       OR (v_user_role_name != 'super_admin' AND v_user_role_name != 'owner')
    THEN
         RAISE EXCEPTION 'Access denied';
    END IF;

    -- Fetch companies with their respective module status.
    -- Replaces the previous LEFT JOIN company_modules (table dropped in
    -- 20260705000009) with LEFT JOIN company_module_grants.
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'settings', c.settings,
            'subscription_tier', c.subscription_tier,
            'is_active', c.is_active,
            'max_users', c.max_users,
            'modules', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'key', mc.key,
                        'label', mc.label,
                        'status', COALESCE(cmg.status, 'inactive')
                    ) ORDER BY mc.key ASC
                )
                FROM public.modules_catalog mc
                LEFT JOIN public.company_module_grants cmg
                    ON cmg.module_key = mc.key
                    AND cmg.company_id = c.id
            )
        ) ORDER BY c.name ASC
    ) INTO v_companies
    FROM public.companies c
    WHERE
        v_user_role_name = 'super_admin'
        OR
        (v_user_role_name = 'owner' AND c.id = v_user_company_id);

    RETURN jsonb_build_object('companies', COALESCE(v_companies, '[]'::jsonb));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_list_companies() TO authenticated;

NOTIFY pgrst, 'reload schema';
