-- Migration: Add reject invitation RPC and get invitation by token RPC
-- Date: 20260401000000
-- Purpose: Add RPCs for rejecting invitations and retrieving invitation details by token

-- Function to reject a company invitation
CREATE OR REPLACE FUNCTION reject_company_invitation(
  p_token UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation_id UUID;
  v_result JSON;
BEGIN
  -- Update invitation status to rejected
  UPDATE company_invitations
  SET status = 'rejected', updated_at = NOW()
  WHERE token = p_token AND status = 'pending'
  RETURNING id INTO v_invitation_id;

  IF v_invitation_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found or already processed');
  END IF;

  RETURN json_build_object('success', true, 'invitation_id', v_invitation_id);
END;
$$;

-- Function to get invitation by token
CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_company_name TEXT;
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
$$;
