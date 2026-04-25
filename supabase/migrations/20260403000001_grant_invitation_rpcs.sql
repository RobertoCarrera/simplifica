-- Grant execute permissions on invitation RPCs so PostgREST exposes them
-- Without these grants, PostgREST returns 404 for the RPC calls

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_company_invitation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation_by_email(text, uuid) TO authenticated;
