-- Enable RLS on role_permissions if not already enabled
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Policy for Owners: Can view, insert, update, delete their company's role_permissions
CREATE POLICY "Owners can manage role permissions"
ON public.role_permissions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE cm.company_id = role_permissions.company_id
    AND u.auth_user_id = auth.uid()
    AND cm.role = 'owner'
    AND cm.status = 'active'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE cm.company_id = role_permissions.company_id
    AND u.auth_user_id = auth.uid()
    AND cm.role = 'owner'
    AND cm.status = 'active'
  )
);

-- Policy for Users: Can view permissions for their company (to know what they can do)
CREATE POLICY "Members can view company permissions"
ON public.role_permissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE cm.company_id = role_permissions.company_id
    AND u.auth_user_id = auth.uid()
    AND cm.status = 'active'
  )
);
