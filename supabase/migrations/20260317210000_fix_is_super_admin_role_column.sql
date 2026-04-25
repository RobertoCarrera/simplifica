-- Fix: is_super_admin_real() references the old "role" column (dropped)
-- which causes every RLS policy that calls this function to fail with
-- "column role does not exist" → 400/500 on all users table queries.
-- Now role is determined solely via app_roles join on app_role_id.

CREATE OR REPLACE FUNCTION public.is_super_admin_real()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name = 'super_admin'
      AND u.active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
