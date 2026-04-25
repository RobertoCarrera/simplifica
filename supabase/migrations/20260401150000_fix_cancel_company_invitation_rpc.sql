-- Fix cancel_company_invitation RPC: fix role lookup
-- Uses public.is_super_admin(user_id) function and company_members + app_roles for role checks
-- Status is set to 'rejected' (not 'cancelled') because that value is not in the constraint

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
BEGIN
  SELECT * INTO v_invitation
  FROM company_invitations
  WHERE id = p_invitation_id;

  IF v_invitation IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitación no encontrada');
  END IF;

  IF v_invitation.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'La invitación ya fue procesada');
  END IF;

  IF NOT (
    v_invitation.invited_by_user_id = p_user_id
    OR EXISTS (
      SELECT 1 FROM company_members cm
      JOIN app_roles ar ON cm.role_id = ar.id
      WHERE cm.user_id = p_user_id
        AND cm.company_id = v_invitation.company_id
        AND ar.name IN ('owner', 'admin')
        AND cm.status = 'active'
    )
    OR public.is_super_admin(p_user_id)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'No tienes permiso para cancelar esta invitación');
  END IF;

  UPDATE company_invitations
  SET status = 'rejected'
  WHERE id = p_invitation_id;

  RETURN json_build_object('success', true);
END;
$$;
