-- Enable RLS and create policies for client_portal_users
-- SELECT: Only the portal user themselves (via auth_user_id) can see their own record
-- UPDATE: The portal user themselves OR an admin/owner/super_admin of the same company

ALTER TABLE public.client_portal_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_portal_users_select_own" ON public.client_portal_users;
DROP POLICY IF EXISTS "client_portal_users_update_own_or_admin" ON public.client_portal_users;

-- SELECT: Portal user sees only their own record
CREATE POLICY "client_portal_users_select_own" ON public.client_portal_users
    FOR SELECT USING (
        auth_user_id = auth.uid()
    );

-- UPDATE: Portal user can update their own record; admins can update any portal user in their company
CREATE POLICY "client_portal_users_update_own_or_admin" ON public.client_portal_users
    FOR UPDATE USING (
        -- Portal user updating their own record
        auth_user_id = auth.uid()
        OR
        -- Admin/Owner/SuperAdmin of the same company updating any portal user
        EXISTS (
            SELECT 1 FROM public.users u
            LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
            WHERE u.auth_user_id = auth.uid()
              AND ar.name IN ('owner', 'admin', 'super_admin')
              AND u.company_id = client_portal_users.company_id
        )
    );
