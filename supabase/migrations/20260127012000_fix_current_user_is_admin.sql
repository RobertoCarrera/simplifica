-- Fix: current_user_is_admin helper function uses legacy 'role' column
-- Description: Updates the function to join app_roles and check role name correctly.

CREATE OR REPLACE FUNCTION public.current_user_is_admin(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Updated check: join company_members with app_roles to check permission
  RETURN EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.company_id = p_company_id
    AND cm.user_id = public.get_my_public_id()
    AND ar.name IN ('owner', 'admin')
    AND cm.status = 'active'
  );
END;
$$;
