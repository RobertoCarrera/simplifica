-- Fix: infinite recursion in users SELECT RLS policy
-- The "Super admins can view all profiles" policy had an inline subquery
-- on public.users inside an RLS policy FOR public.users, causing PostgreSQL
-- to recurse infinitely → 500 Internal Server Error on every SELECT on users.
--
-- Fix: replace the inline subquery with the existing SECURITY DEFINER function
-- is_super_admin_real(), which runs with elevated privileges and bypasses RLS.

DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.users;

CREATE POLICY "Super admins can view all profiles" ON public.users
  FOR SELECT
  USING (public.is_super_admin_real());
