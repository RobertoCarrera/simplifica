-- [AUDIT PHASE 3]
-- Strict Access Control: Super Admin ONLY
-- Revoke previous policy that allowed owners/admins
DROP POLICY IF EXISTS "Admins can view company audit logs" ON public.audit_logs;

-- Create new policy for Global View (Cross-Company)
CREATE POLICY "Super Admins can view ALL audit logs" ON public.audit_logs
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.app_roles ar ON u.app_role_id = ar.id
        WHERE u.auth_user_id = auth.uid()
        AND ar.name = 'super_admin'
    )
);
