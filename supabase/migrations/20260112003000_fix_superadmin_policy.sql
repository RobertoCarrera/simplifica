-- Correcting the policy to use auth_user_id instead of id
-- Allow Superadmins to view ALL companies
-- Using app_role_id for 'super_admin': 193d8af6-e24e-47ff-944a-bb8176a412ab

DROP POLICY IF EXISTS "Superadmins can view all companies" ON companies;

CREATE POLICY "Superadmins can view all companies" ON companies
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_user_id = auth.uid() 
    AND app_role_id = '193d8af6-e24e-47ff-944a-bb8176a412ab'
  )
);
