-- Fix: current_user_is_admin helper check via users.app_role_id
-- Description: Updates the function to check users table (linked via app_role_id) for admin/owner role.

CREATE OR REPLACE FUNCTION public.current_user_is_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the current authenticated user has an admin/owner role for the target company.
  -- Logic:
  -- 1. Get user from public.users by auth.uid()
  -- 2. Check if users.company_id matches p_company_id (or if they are in company_members, but user emphasized users.app_role_id)
  -- 3. Check if users.app_role_id points to 'owner' or 'admin'
  -- 4. ALSO checking company_members.role_id as a fallback/alternative if users table approach fails for multi-company? 
  --    User specifically showed users.app_role_id. Let's try to support both to be robust or just users if that's the primary.
  --    Let's stick to the User's explicit direction: users.app_role_id.
  
  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = p_company_id
    AND u.active = true
    AND ar.name IN ('owner', 'admin')
  );
END;
$$;
