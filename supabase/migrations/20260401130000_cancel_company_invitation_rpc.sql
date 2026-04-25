-- Add cancel_company_invitation RPC for admin panel
-- Task 4.3: Cancel invitation with permission check

CREATE OR REPLACE FUNCTION cancel_company_invitation(
  p_invitation_id UUID,
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_company_id UUID;
  v_user_role TEXT;
BEGIN
  -- Get the invitation
  SELECT * INTO v_invitation
  FROM company_invitations
  WHERE id = p_invitation_id;

  IF v_invitation IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitación no encontrada');
  END IF;

  -- Check if already processed
  IF v_invitation.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'La invitación ya fue procesada');
  END IF;

  -- Get user's role in the company
  SELECT role, company_id INTO v_user_role, v_company_id
  FROM users
  WHERE id = p_user_id;

  -- Check permission: only inviter, owner, admin, or super_admin can cancel
  IF v_invitation.invited_by_user_id != p_user_id 
     AND v_user_role NOT IN ('owner', 'admin')
     AND NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND is_super_admin = true) THEN
    RETURN json_build_object('success', false, 'error', 'No tienes permiso para cancelar esta invitación');
  END IF;

  -- Update status to cancelled
  UPDATE company_invitations
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_invitation_id;

  RETURN json_build_object('success', true);
END;
$$;