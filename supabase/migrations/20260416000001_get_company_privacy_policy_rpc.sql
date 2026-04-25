-- Migration: Add public RPC to serve published company privacy policies
-- Needed for /privacy/:companyId route (unauthenticated access)
-- The companies table has RLS, so direct queries by anon are blocked.
-- This SECURITY DEFINER function bypasses RLS and returns only the
-- published privacy policy content for a given company.

CREATE OR REPLACE FUNCTION public.get_company_privacy_policy(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content text;
BEGIN
  SELECT settings->>'privacy_policy_content'
  INTO v_content
  FROM public.companies
  WHERE id = p_company_id
    AND settings->>'privacy_policy_published_at' IS NOT NULL;

  RETURN v_content;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_privacy_policy(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_company_privacy_policy(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
