-- Migration: Add get_pending_invitation_by_email RPC for invite component magic-link flow
-- Date: 2026-04-16
-- Purpose: When a user lands on /invite (no token in URL) but is already logged in via
-- magic link (auth-callback redirect), we need to find their pending invitation by email
-- so they can accept it without needing the token in the URL.

CREATE OR REPLACE FUNCTION public.get_pending_invitation_by_email(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation record;
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
  WHERE lower(ci.email) = lower(p_email)
    AND ci.status = 'pending'
    AND ci.expires_at > NOW()
  ORDER BY ci.created_at DESC
  LIMIT 1;

  IF v_invitation IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No pending invitation found for this email');
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
      'message', v_invitation.message,
      'token', (SELECT token FROM company_invitations WHERE id = v_invitation.id)
    )
  );
END;
$function$;

-- Grant execute to authenticated users (InviteComponent runs as logged-in user)
GRANT EXECUTE ON FUNCTION public.get_pending_invitation_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_invitation_by_email(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_pending_invitation_by_email(text) TO service_role;
