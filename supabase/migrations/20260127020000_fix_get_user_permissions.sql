-- Fix: get_user_permissions (Correct Signature)
-- Description: Updates get_user_permissions to query role_id, using correct argument order (user_id first).

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id uuid, p_company_id uuid)
RETURNS TABLE (permission text, granted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role_id uuid;
BEGIN
    -- Get user's role_id in the company (company_members)
    SELECT role_id INTO v_role_id 
    FROM public.company_members 
    WHERE user_id = p_user_id AND company_id = p_company_id AND status = 'active'
    LIMIT 1;
    
    -- Fallback: check users table (primary company role)
    IF v_role_id IS NULL THEN
        SELECT app_role_id INTO v_role_id 
        FROM public.users 
        WHERE id = p_user_id 
        AND (company_id = p_company_id OR company_id IS NULL);
    END IF;

    -- Return permissions for that role_id
    RETURN QUERY
    SELECT rp.permission, rp.granted
    FROM public.role_permissions rp
    WHERE rp.company_id = p_company_id 
    AND rp.role_id = v_role_id;
END;
$$;
