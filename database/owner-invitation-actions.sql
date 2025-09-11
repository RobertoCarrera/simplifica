-- Owner actions for company invitations: approve and reject
CREATE OR REPLACE FUNCTION public.approve_company_invitation(p_invitation_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inv RECORD;
  approver_user RECORD;
  pending_data RECORD;
  new_user_id uuid;
BEGIN
  -- Load invitation
  SELECT * INTO inv FROM public.company_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found');
  END IF;

  -- Ensure current user is owner/admin of the company
  SELECT * INTO approver_user
  FROM public.users u
  WHERE u.company_id = inv.company_id
    AND u.auth_user_id = auth.uid()
    AND u.active = true
    AND u.role IN ('owner','admin')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- If already accepted/rejected/expired, no-op
  IF inv.status <> 'pending' THEN
    RETURN json_build_object('success', true, 'message', 'Invitation already handled', 'status', inv.status);
  END IF;

  -- Mark accepted and responded_at
  UPDATE public.company_invitations
  SET status = 'accepted', responded_at = now()
  WHERE id = inv.id;

  -- If the invited user already confirmed signup and exists in pending_users, create the app user now
  SELECT * INTO pending_data
  FROM public.pending_users
  WHERE email = inv.email
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND AND pending_data.auth_user_id IS NOT NULL THEN
    INSERT INTO public.users (email, name, role, active, company_id, auth_user_id, permissions)
    VALUES (inv.email, COALESCE(pending_data.full_name, split_part(inv.email, '@', 1)), inv.role, true, inv.company_id, pending_data.auth_user_id, '{}'::jsonb)
    ON CONFLICT DO NOTHING
    RETURNING id INTO new_user_id;

    -- Mark pending as confirmed if not already
    UPDATE public.pending_users SET confirmed_at = COALESCE(confirmed_at, now())
    WHERE auth_user_id = pending_data.auth_user_id;
  END IF;

  RETURN json_build_object('success', true, 'invitation_id', inv.id, 'company_id', inv.company_id, 'user_created', new_user_id IS NOT NULL);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_company_invitation(p_invitation_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inv RECORD;
  approver_user RECORD;
BEGIN
  -- Load invitation
  SELECT * INTO inv FROM public.company_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found');
  END IF;

  -- Ensure current user is owner/admin of the company
  SELECT * INTO approver_user
  FROM public.users u
  WHERE u.company_id = inv.company_id
    AND u.auth_user_id = auth.uid()
    AND u.active = true
    AND u.role IN ('owner','admin')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Update status to rejected
  UPDATE public.company_invitations
  SET status = 'rejected', responded_at = now()
  WHERE id = inv.id AND status = 'pending';

  RETURN json_build_object('success', true, 'invitation_id', inv.id, 'status', 'rejected');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
