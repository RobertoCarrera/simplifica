-- Migration: Fix accept_company_invitation_by_email for multi-company memberships
--
-- Bug: The _by_email fallback function overwrites users.company_id with the invitation's
-- company, breaking multi-company support. This aligns it with the token-based function
-- (20260402000000_fix_accept_invitation_multicompany.sql) that only sets company_id if NULL.

CREATE OR REPLACE FUNCTION accept_company_invitation_by_email(
    p_email text,
    p_auth_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.company_invitations;
  existing_user public.users;
  placeholder_user public.users;
  new_user_id uuid;
  company_name text;
  v_role_id uuid;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_auth_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO inv
  FROM public.company_invitations
  WHERE LOWER(email) = LOWER(p_email)
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found for email');
  END IF;

  SELECT name INTO company_name FROM public.companies WHERE id = inv.company_id;

  IF inv.status = 'accepted' THEN
    RETURN json_build_object('success', true, 'company_id', inv.company_id, 'company_name', company_name, 'role', inv.role, 'message', 'Invitation already accepted');
  END IF;

  -- Check if super admin owner invite (company_id is null)
  IF inv.company_id IS NULL THEN
      UPDATE public.company_invitations SET status = 'accepted', responded_at = NOW() WHERE id = inv.id;
      RETURN json_build_object('success', true, 'company_id', null, 'company_name', null, 'role', inv.role, 'message', 'Owner invite accepted successfully');
  END IF;

  -- Map Text Role -> UUID
  SELECT id INTO v_role_id FROM public.app_roles WHERE name = inv.role;

  SELECT * INTO existing_user FROM public.users WHERE auth_user_id = p_auth_user_id LIMIT 1;

  IF FOUND THEN
    new_user_id := existing_user.id;

    -- Only set company_id if user has no primary company yet (preserve multi-company)
    IF existing_user.company_id IS NULL THEN
      UPDATE public.users
      SET company_id = inv.company_id,
          app_role_id = v_role_id,
          active = true,
          updated_at = NOW()
      WHERE id = existing_user.id;
    END IF;
  ELSE
    SELECT * INTO placeholder_user
    FROM public.users
    WHERE email = inv.email AND company_id = inv.company_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.users
      SET auth_user_id = p_auth_user_id,
          active = true,
          updated_at = NOW()
      WHERE id = placeholder_user.id
      RETURNING id INTO new_user_id;
    ELSE
      INSERT INTO public.users (email, name, surname, active, company_id, auth_user_id, permissions)
      VALUES (inv.email, split_part(inv.email, '@', 1), NULL, true, inv.company_id, p_auth_user_id, '{}'::jsonb)
      RETURNING id INTO new_user_id;
    END IF;
  END IF;

  -- Upsert Membership with correct role
  INSERT INTO public.company_members (user_id, company_id, role_id, status)
  VALUES (new_user_id, inv.company_id, v_role_id, 'active')
  ON CONFLICT (user_id, company_id) DO UPDATE
  SET role_id = EXCLUDED.role_id, status = 'active', updated_at = NOW();

  UPDATE public.company_invitations
  SET status = 'accepted', responded_at = NOW()
  WHERE id = inv.id;

  UPDATE public.pending_users
  SET confirmed_at = NOW(), company_id = inv.company_id
  WHERE auth_user_id = p_auth_user_id AND email = inv.email;

  RETURN json_build_object('success', true, 'user_id', new_user_id, 'company_id', inv.company_id, 'company_name', company_name, 'role', inv.role, 'message', 'Invitation accepted successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
