-- Fix admin_set_user_module to allow Super Admin and Owners to manage modules
-- Uses app_roles and auth_user_id for correct permission checking

-- DROP first to handle return type changes
DROP FUNCTION IF EXISTS public.admin_set_user_module(uuid, text, text);

CREATE OR REPLACE FUNCTION public.admin_set_user_module(
    p_target_user_id uuid,
    p_module_key text,
    p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_caller_role text;
    v_caller_company_id uuid;
    v_target_company_id uuid;
BEGIN
    -- 1. Get Caller Info (Role and Company)
    SELECT ar.name, u.company_id
    INTO v_caller_role, v_caller_company_id
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid();

    -- 2. Get Target User Info
    SELECT company_id INTO v_target_company_id
    FROM public.users
    WHERE id = p_target_user_id;

    IF v_target_company_id IS NULL THEN
        RAISE EXCEPTION 'Target user not found';
    END IF;

    -- 3. Permission Logic
    -- Super Admin can do anything
    IF v_caller_role = 'super_admin' THEN
        -- Allowed
    -- Owners/Admins can only modify users in THEIR company
    ELSIF v_caller_role IN ('owner', 'admin') THEN
        IF v_caller_company_id != v_target_company_id THEN
            RAISE EXCEPTION 'Access denied: You can only manage modules for your own company';
        END IF;
    ELSE
        RAISE EXCEPTION 'Access denied: Insufficient privileges';
    END IF;

    -- 4. Execute Update
    INSERT INTO public.user_modules (user_id, module_key, status, updated_at)
    VALUES (p_target_user_id, p_module_key, p_status, now())
    ON CONFLICT (user_id, module_key)
    DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = now();
END;
$function$;
