-- Fix type mismatch: company_invitations.token is TEXT but functions declared uuid params
-- This caused "operator does not exist: text = uuid" at runtime → PostgREST 404/500

-- 1. Drop old function signatures (uuid params)
DROP FUNCTION IF EXISTS public.get_invitation_by_token(uuid);
DROP FUNCTION IF EXISTS public.reject_company_invitation(uuid, uuid);

-- 2. Recreate get_invitation_by_token with TEXT param (matches column type)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation RECORD;
BEGIN
  SELECT
    ci.id, ci.email, ci.role, ci.status, ci.expires_at,
    ci.company_id, ci.message, ci.invited_by_user_id,
    u.email as inviter_email,
    c.name as company_name
  INTO v_invitation
  FROM company_invitations ci
  LEFT JOIN users u ON u.id = ci.invited_by_user_id
  LEFT JOIN companies c ON c.id = ci.company_id
  WHERE ci.token = p_token;

  IF v_invitation IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found');
  END IF;

  RETURN json_build_object(
    'success', true,
    'invitation', json_build_object(
      'id', v_invitation.id,
      'email', v_invitation.email,
      'role', v_invitation.role,
      'status', v_invitation.status,
      'expires_at', v_invitation.expires_at,
      'company_id', v_invitation.company_id,
      'company_name', v_invitation.company_name,
      'inviter_email', v_invitation.inviter_email,
      'message', v_invitation.message
    )
  );
END;
$function$;

-- 3. Recreate reject_company_invitation with TEXT token param
CREATE OR REPLACE FUNCTION public.reject_company_invitation(p_token text, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation_id UUID;
BEGIN
  UPDATE company_invitations
  SET status = 'rejected', updated_at = NOW()
  WHERE token = p_token AND status = 'pending'
  RETURNING id INTO v_invitation_id;

  IF v_invitation_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found or already processed');
  END IF;

  RETURN json_build_object('success', true, 'invitation_id', v_invitation_id);
END;
$function$;

-- 4. Re-grant permissions (new signatures need fresh grants)
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.reject_company_invitation(text, uuid) TO authenticated;

-- 5. Ensure other invitation functions also have grants
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation_by_email(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation_admin(text, uuid) TO authenticated;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
