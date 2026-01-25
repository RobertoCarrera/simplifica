-- 20260525000000_secure_invoices_rls.sql

-- SECURITY FIX: Restrict Invoice Management to Admins/Owners
-- Previously, any active company member could create/update invoices.
-- This migration restricts it to users with 'owner' or 'admin' roles.

-- 1. Drop permissive policies
DROP POLICY IF EXISTS "invoices_insert_policy" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_policy" ON public.invoices;

-- 2. Create strict policies

-- INSERT: Only Owners/Admins
CREATE POLICY "invoices_insert_policy" ON public.invoices
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = invoices.company_id
      AND cm.status = 'active'
      AND (
        cm.role IN ('owner', 'admin') -- Legacy text role check
        OR
        ar.name IN ('owner', 'admin') -- New app_roles check
      )
  )
);

-- UPDATE: Only Owners/Admins
CREATE POLICY "invoices_update_policy" ON public.invoices
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = invoices.company_id
      AND cm.status = 'active'
      AND (
        cm.role IN ('owner', 'admin')
        OR
        ar.name IN ('owner', 'admin')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = invoices.company_id
      AND cm.status = 'active'
      AND (
        cm.role IN ('owner', 'admin')
        OR
        ar.name IN ('owner', 'admin')
      )
  )
);
