CREATE OR REPLACE FUNCTION public.is_super_admin_by_id(p_user_id uuid) 
RETURNS BOOLEAN AS $$
DECLARE
    is_admin boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 
        FROM public.users u
        JOIN public.app_roles ar ON u.app_role_id = ar.id
        WHERE u.auth_user_id = p_user_id 
          AND ar.name = 'super_admin'
          AND u.active = true
    ) INTO is_admin;
    
    RETURN is_admin;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
