-- Fix app_settings_write RLS policy
-- Bug: `u.id = auth.uid()` was comparing the internal public.users.id (gen_random_uuid())
-- against auth.uid() which returns the Supabase auth.users UUID.
-- The correct column is u.auth_user_id.
-- This caused all non-super_admin owners/admins to get a 403 on INSERT/UPDATE.

DROP POLICY IF EXISTS "app_settings_write" ON public.app_settings;

CREATE POLICY "app_settings_write" ON public.app_settings
FOR ALL TO public
USING (
  (auth.role() = 'service_role'::text) OR
  (EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('admin', 'owner', 'super_admin')
  ))
)
WITH CHECK (
  (auth.role() = 'service_role'::text) OR
  (EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('admin', 'owner', 'super_admin')
  ))
);
