-- Allow Superadmins (app_role = 'super_admin' or similar check) to view ALL companies
-- We assume there is a way to check if a user is a super_admin.
-- Let's check if we have a function or if we can check "public.users.app_role".
-- RLS usually runs with auth.uid(). 

-- Option 1: Generic policy using exists on users table
CREATE POLICY "Superadmins can view all companies" ON companies
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND (app_role = 'admin' OR app_role = 'super_admin' OR role = 'super_admin') -- Checking standardized role columns
  )
);

-- Note: The column name for role in `users` table needs to be confirmed.
-- Based on `AuthService`, the interface has `role: 'super_admin' | ...` derived from somewhere.
-- Let's inspect `users` table columns to be sure.
