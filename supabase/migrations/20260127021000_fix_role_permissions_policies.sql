-- Fix: Broken RLS policies on role_permissions referencing non-existent 'role' column.

-- 1. Drop existing policies (using IF EXISTS to be safe)
DROP POLICY IF EXISTS "Members can view company permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Owners can manage role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_delete_policy" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_insert_policy" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_select_policy" ON public.role_permissions;
DROP POLICY IF EXISTS "role_permissions_update_policy" ON public.role_permissions;

-- 2. Re-create Policies with proper role_id logic

-- SELECT: All active members can view
CREATE POLICY "Members can view company permissions" ON public.role_permissions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = role_permissions.company_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
  )
);

-- INSERT: Owners/Admins
CREATE POLICY "role_permissions_insert_policy" ON public.role_permissions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.company_id = company_id -- (New row's company_id)
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
    AND ar.name IN ('owner', 'admin')
  )
);

-- UPDATE: Owners/Admins
CREATE POLICY "role_permissions_update_policy" ON public.role_permissions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.company_id = role_permissions.company_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
    AND ar.name IN ('owner', 'admin')
  )
);

-- DELETE: Owners/Admins
CREATE POLICY "role_permissions_delete_policy" ON public.role_permissions
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.company_id = role_permissions.company_id
    AND cm.user_id = auth.uid()
    AND cm.status = 'active'
    AND ar.name IN ('owner', 'admin')
  )
);

-- Note: "Owners can manage role permissions" (CMD: ALL) is redundant if we have specific policies, 
-- but if we want strictly Owners to do EVERYTHING (including some other ops), we could add it.
-- However, generally 'insert/update/delete' policies cover modification.
-- I'll skip the 'ALL' policy to avoid conflicts/redundancy, or re-add it only for 'owner' specific if needed.
-- The previous 'Owners can manage...' checked role='owner'. The above cover 'owner' + 'admin'.
-- If admins *shouldn't* manage permissions, I should restrict it.
-- But standard practice: Admins manage permissions? 
-- The previous specific policies (delete/insert/update) checked ['owner', 'admin']. 
-- So I'll stick to that.

