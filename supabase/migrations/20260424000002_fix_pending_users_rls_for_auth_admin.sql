-- 20260424000002_fix_pending_users_rls_for_auth_admin.sql
--
-- PROBLEM: Migration 20260318200000_security_audit_enable_rls.sql enabled RLS on
-- pending_users with the comment "No user-facing policy needed; edge functions use
-- service_role". This was WRONG: GoTrue uses the supabase_auth_admin role (not
-- service_role) for all auth.users admin operations including DELETE.
--
-- SYMPTOM: DELETE /admin/users/{id} → 500 "permission denied for table pending_users"
-- because GoTrue tries to clean up related rows when deleting a user.
--
-- FIX: Grant table-level permissions and create an RLS policy for supabase_auth_admin.

-- 1. Grant table-level permissions so the role can execute any operation
GRANT ALL ON TABLE public.pending_users TO supabase_auth_admin;

-- 2. Create an RLS policy so row-level checks also pass for this role
DROP POLICY IF EXISTS "supabase_auth_admin can manage pending_users" ON public.pending_users;
CREATE POLICY "supabase_auth_admin can manage pending_users"
  ON public.pending_users
  TO supabase_auth_admin
  USING (true)
  WITH CHECK (true);
