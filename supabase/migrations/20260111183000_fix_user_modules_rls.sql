-- Enable RLS on user_modules
ALTER TABLE "public"."user_modules" ENABLE ROW LEVEL SECURITY;

-- 1. Policy for Super Admin (Full Access to everything)
-- They can Select, Insert, Update, Delete any row.
CREATE POLICY "super_admin_manage_all_user_modules" ON "public"."user_modules"
AS PERMISSIVE FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND ar.name = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND ar.name = 'super_admin'
  )
);

-- 2. Policy for Company Owners and Admins (Select Only)
-- Writes are handled via RPC (upsert_user_module implies logic there, or if direct, we'd need policy).
-- For now, frontend uses direct SELECT to load.
CREATE POLICY "company_admin_select_company_user_modules" ON "public"."user_modules"
AS PERMISSIVE FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users req_u
    JOIN public.app_roles req_ar ON req_u.app_role_id = req_ar.id
    JOIN public.users target_u ON target_u.id = user_modules.user_id
    WHERE req_u.auth_user_id = auth.uid()
    AND req_u.company_id = target_u.company_id
    AND req_ar.name IN ('owner', 'admin')
  )
);

-- 3. Policy for Users (Select Own)
-- Users can see their own modules (e.g. for bootstrapping / verification)
CREATE POLICY "users_select_own_modules" ON "public"."user_modules"
AS PERMISSIVE FOR SELECT
TO public
USING (
  user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
);
