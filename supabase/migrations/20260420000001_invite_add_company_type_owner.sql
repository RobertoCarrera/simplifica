-- Extend get_invitation_by_token to expose company_type and owner_name so the
-- invite screen can show the correct "Responsable" per Art. 13 RGPD:
--   - autonomo  → owner_name (name + surnames of the self-employed person)
--   - empresa   → company name

DROP FUNCTION IF EXISTS public.get_invitation_by_token(text);

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
    u.email   AS inviter_email,
    c.name    AS company_name,
    c.company_type,
    c.settings->>'owner_name' AS owner_name
  INTO v_invitation
  FROM company_invitations ci
  LEFT JOIN users    u ON u.id = ci.invited_by_user_id
  LEFT JOIN companies c ON c.id = ci.company_id
  WHERE ci.token = p_token;

  IF v_invitation IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found');
  END IF;

  RETURN json_build_object(
    'success', true,
    'invitation', json_build_object(
      'id',           v_invitation.id,
      'email',        v_invitation.email,
      'role',         v_invitation.role,
      'status',       v_invitation.status,
      'expires_at',   v_invitation.expires_at,
      'company_id',   v_invitation.company_id,
      'company_name', v_invitation.company_name,
      'company_type', v_invitation.company_type,
      'owner_name',   v_invitation.owner_name,
      'inviter_email',v_invitation.inviter_email,
      'message',      v_invitation.message
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon;
