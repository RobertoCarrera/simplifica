-- Fix Critical RLS Vulnerability: Remove TO public policies on company_members
-- Replace with TO authenticated policies using the same logic

-- Drop potentially insecure policies
DROP POLICY IF EXISTS "Company admins can view members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can update members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can delete members" ON public.company_members;

-- Recreate them restricted to authenticated users
CREATE POLICY "Company admins can view members"
ON public.company_members
FOR SELECT
TO authenticated
USING (
  public.current_user_is_admin(company_id)
);

CREATE POLICY "Company admins can update members"
ON public.company_members
FOR UPDATE
TO authenticated
USING (
  public.current_user_is_admin(company_id)
);

CREATE POLICY "Company admins can delete members"
ON public.company_members
FOR DELETE
TO authenticated
USING (
  public.current_user_is_admin(company_id)
);
