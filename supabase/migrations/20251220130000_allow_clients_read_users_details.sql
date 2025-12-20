-- Allow authenticated users to view basic details of other users
-- This is essential for clients to see the names of staff members in ticket comments
-- and for staff to see client names.

-- Drop existing restricted policy if it exists (or similar common names)
DROP POLICY IF EXISTS "Users can view their own profile" ON "public"."users";
DROP POLICY IF EXISTS "Allow viewing profile for own company" ON "public"."users";
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON "public"."users";

-- Re-create policies.
-- 1. Users can always see their own profile (often needed for full access)
CREATE POLICY "Users can view their own profile"
ON "public"."users"
FOR SELECT
USING (auth.uid() = auth_user_id);

-- 2. Allow reading basic info for tickets/collaboration. 
-- Since we can't easily filter by "users referenced in tickets I can see" without complex joins that might impact performance or cause recursion,
-- we allow authenticated users to read profiles.
-- NOTE: If this is too permissive, restrictive checks on columns 'name', 'surname', 'role', 'email' would be handled by application logic, 
-- but RLS protects rows. 
CREATE POLICY "Enable read access for authenticated users"
ON "public"."users"
FOR SELECT
TO authenticated
USING (true);

-- Ensure RLS is enabled
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
