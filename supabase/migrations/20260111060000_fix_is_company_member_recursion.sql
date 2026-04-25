-- Fix recursion in companies RLS by optimizing is_company_member
-- Previous implementation joined public.users causing infinite recursion loop
-- New implementation uses get_my_public_id() to avoid querying users table

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
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
    AND cm.user_id = public.get_my_public_id() -- SAFE: prevents users table RLS check
    AND cm.status = 'active'
  );
END;
$function$;
