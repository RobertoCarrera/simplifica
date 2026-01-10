-- Fix recursion in company_members RLS by using a SECURITY DEFINER function for admin checks
-- Previous implementation queried company_members recursively to check for admin role
-- New implementation uses a dedicated function to checking admin status without triggering RLS

CREATE OR REPLACE FUNCTION public.current_user_is_admin(p_company_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Optimized check: direct lookup in company_members using safe ID function
  RETURN EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
    AND cm.user_id = public.get_my_public_id()
    AND cm.role IN ('owner', 'admin')
    AND cm.status = 'active'
  );
END;
$function$;

-- Update policies to use the new safe function
DROP POLICY IF EXISTS "Company admins can view members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can update members" ON public.company_members;
DROP POLICY IF EXISTS "Company admins can delete members" ON public.company_members;

CREATE POLICY "Company admins can view members"
ON public.company_members
FOR SELECT
TO public
USING (
  public.current_user_is_admin(company_id)
);

CREATE POLICY "Company admins can update members"
ON public.company_members
FOR UPDATE
TO public
USING (
  public.current_user_is_admin(company_id)
);

CREATE POLICY "Company admins can delete members"
ON public.company_members
FOR DELETE
TO public
USING (
  public.current_user_is_admin(company_id)
);
