-- Allow admins/owners/super_admins to create mail accounts for any member of their company
-- Previously the INSERT policy only allowed users to create accounts for themselves.

-- Drop the old restrictive INSERT policy
DROP POLICY IF EXISTS "Users can create mail accounts" ON public.mail_accounts;

-- New INSERT policy:
--   1. A user can always create an account for themselves.
--   2. An admin, owner or super_admin can create for any active member of the same company.
CREATE POLICY "Users and admins can create mail accounts"
ON public.mail_accounts
FOR INSERT
WITH CHECK (
    -- Self: the target user_id maps to the current auth user
    user_id IN (
        SELECT id FROM public.users
        WHERE auth_user_id = auth.uid()
    )
    OR
    -- Admin/owner: current user is admin+ in a company that also contains the target user
    EXISTS (
        SELECT 1
        FROM public.company_members cm_admin
        JOIN public.app_roles ar ON ar.id = cm_admin.role_id
        WHERE cm_admin.user_id IN (
                SELECT id FROM public.users WHERE auth_user_id = auth.uid()
              )
          AND ar.name IN ('owner', 'admin', 'super_admin')
          AND cm_admin.status = 'active'
          AND cm_admin.company_id IN (
                -- The target user must belong to the same company
                SELECT company_id
                FROM public.company_members
                WHERE user_id = mail_accounts.user_id
                  AND status = 'active'
              )
    )
);

-- Also update the SELECT/UPDATE/DELETE "FOR ALL" policy so admins can see/manage
-- accounts they created for team members (not just their own).
DROP POLICY IF EXISTS "Users can manage their own mail accounts" ON public.mail_accounts;

CREATE POLICY "Users can manage their own mail accounts"
ON public.mail_accounts
FOR SELECT
USING (
    -- Own accounts
    user_id IN (
        SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
    OR
    -- Admin/owner can see all accounts within their company
    EXISTS (
        SELECT 1
        FROM public.company_members cm_admin
        JOIN public.app_roles ar ON ar.id = cm_admin.role_id
        WHERE cm_admin.user_id IN (
                SELECT id FROM public.users WHERE auth_user_id = auth.uid()
              )
          AND ar.name IN ('owner', 'admin', 'super_admin')
          AND cm_admin.status = 'active'
          AND cm_admin.company_id IN (
                SELECT company_id
                FROM public.company_members
                WHERE user_id = mail_accounts.user_id
                  AND status = 'active'
              )
    )
);

CREATE POLICY "Users can update their own mail accounts"
ON public.mail_accounts
FOR UPDATE
USING (
    user_id IN (
        SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
    OR
    EXISTS (
        SELECT 1
        FROM public.company_members cm_admin
        JOIN public.app_roles ar ON ar.id = cm_admin.role_id
        WHERE cm_admin.user_id IN (
                SELECT id FROM public.users WHERE auth_user_id = auth.uid()
              )
          AND ar.name IN ('owner', 'admin', 'super_admin')
          AND cm_admin.status = 'active'
          AND cm_admin.company_id IN (
                SELECT company_id
                FROM public.company_members
                WHERE user_id = mail_accounts.user_id
                  AND status = 'active'
              )
    )
);

CREATE POLICY "Users can delete their own mail accounts"
ON public.mail_accounts
FOR DELETE
USING (
    user_id IN (
        SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
    OR
    EXISTS (
        SELECT 1
        FROM public.company_members cm_admin
        JOIN public.app_roles ar ON ar.id = cm_admin.role_id
        WHERE cm_admin.user_id IN (
                SELECT id FROM public.users WHERE auth_user_id = auth.uid()
              )
          AND ar.name IN ('owner', 'admin', 'super_admin')
          AND cm_admin.status = 'active'
          AND cm_admin.company_id IN (
                SELECT company_id
                FROM public.company_members
                WHERE user_id = mail_accounts.user_id
                  AND status = 'active'
              )
    )
);
