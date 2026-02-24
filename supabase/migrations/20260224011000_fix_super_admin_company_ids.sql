-- Fix: get_my_company_ids() should return ALL companies for super_admin
-- Previously, super_admin couldn't see services for companies they weren't
-- a member of (e.g. CAIBS), because RLS policies use this function.
CREATE OR REPLACE FUNCTION public.get_my_company_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- Super admin gets all non-deleted companies
    WHEN public.is_super_admin(auth.uid()) THEN
      (SELECT array_agg(id) FROM companies WHERE deleted_at IS NULL)
    -- Regular user gets only companies where they are active members
    ELSE
      (SELECT array_agg(company_id)
       FROM company_members
       WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
       AND status = 'active')
  END;
$$;
