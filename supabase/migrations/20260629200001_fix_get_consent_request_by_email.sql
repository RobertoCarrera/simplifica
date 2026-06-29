-- Fix: get_consent_request_by_email references a non-existent column
-- (companies.privacy_policy_url). The default URL is fine for v1 — tenant
-- privacy URLs can be wired later via companies.settings.

CREATE OR REPLACE FUNCTION public.get_consent_request_by_email(
  p_company_id uuid,
  p_email text
)
RETURNS TABLE (
  client_id uuid,
  client_name text,
  subject_email text,
  company_id uuid,
  company_name text,
  company_nif text,
  invitation_status text,
  consent_status text,
  privacy_policy_url text,
  has_account boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_client record;
  v_company record;
BEGIN
  p_email := lower(trim(p_email));

  SELECT c.id,
         c.name,
         c.email,
         c.company_id,
         c.invitation_status::text AS invitation_status,
         c.consent_status::text   AS consent_status
    INTO v_client
  FROM public.clients c
  WHERE c.email = p_email
    AND c.company_id = p_company_id
    AND c.deleted_at IS NULL
  LIMIT 1;

  IF v_client.id IS NULL THEN
    RETURN;
  END IF;

  SELECT name, nif
    INTO v_company
  FROM public.companies
  WHERE id = p_company_id
  LIMIT 1;

  RETURN QUERY SELECT
    v_client.id,
    v_client.name::text,
    v_client.email::text,
    p_company_id,
    COALESCE(v_company.name, '')::text,
    COALESCE(v_company.nif, '')::text,
    COALESCE(v_client.invitation_status, 'not_sent'),
    COALESCE(v_client.consent_status, 'pending'),
    'https://app.simplificacrm.es/privacidad'::text,
    EXISTS(SELECT 1 FROM auth.users au WHERE lower(trim(au.email)) = p_email);
END;
$$;

COMMENT ON FUNCTION public.get_consent_request_by_email(uuid, text) IS
  'Email-based consent-request lookup. Powers the /consent?c=&e= portal page. '
  'SECURITY DEFINER with search_path pinned to public.';

GRANT EXECUTE ON FUNCTION public.get_consent_request_by_email(uuid, text) TO anon, authenticated;