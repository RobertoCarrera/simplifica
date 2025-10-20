-- Helper function to fetch company invitation token by id
-- SECURITY: SECURITY DEFINER; restrict exposure as needed (service role will use it)

CREATE OR REPLACE FUNCTION public.get_company_invitation_token(p_invitation_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT token INTO v_token
  FROM public.company_invitations
  WHERE id = p_invitation_id;

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.get_company_invitation_token(uuid) IS 'Returns token for a given company_invitations.id';

-- Grant to authenticated minimally (service role bypasses anyway); adjust if needed
GRANT EXECUTE ON FUNCTION public.get_company_invitation_token(uuid) TO authenticated;
