-- Fix recursion between companies and clients RLS
-- The previous 'companies_client_access' policy queried the 'clients' table directly.
-- When a user queried 'clients' and joined 'companies', this created a loop:
-- clients -> companies -> companies policy -> clients -> companies ...

-- We create a SECURITY DEFINER function to check if the current user is a client of the company.
-- This function bypasses RLS on the 'clients' table, preventing the recursion.

CREATE OR REPLACE FUNCTION public.client_can_access_company(p_company_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if the current user (auth.uid()) is a client of the given company.
  -- We use get_my_public_id() if needed, but for clients table we usually link by auth_user_id.
  -- Based on the previous policy: SELECT clients.company_id FROM clients WHERE clients.auth_user_id = auth.uid()
  
  RETURN EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.company_id = p_company_id
    AND c.auth_user_id = auth.uid()
  );
END;
$function$;

-- Update the policy to use the safe function
DROP POLICY IF EXISTS "companies_client_access" ON public.companies;

CREATE POLICY "companies_client_access"
ON public.companies
FOR SELECT
TO public
USING (
  public.client_can_access_company(id)
);
