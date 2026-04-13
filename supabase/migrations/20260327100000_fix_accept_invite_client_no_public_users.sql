-- Migration: Fix accept_company_invitation to not require public.users for client role
-- Clients are portal-only users and may not have a public.users record.
-- For client invitations, we only need to link clients.auth_user_id — no company_members insert required.

CREATE OR REPLACE FUNCTION public.accept_company_invitation(
  p_invitation_token text,
  p_auth_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation record;
  v_user_id uuid;
  v_role_id uuid;
  v_company_name text;
BEGIN
  -- 1. Validate Invitation
  SELECT i.*, c.name as company_name
  INTO v_invitation
  FROM public.company_invitations i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.token = p_invitation_token
    AND i.status = 'pending';

  IF v_invitation.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- 2. Look up public.users record (optional for clients)
  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = p_auth_user_id;

  -- For non-client roles, require a public.users record
  IF v_user_id IS NULL AND v_invitation.role != 'client' THEN
    RETURN json_build_object('success', false, 'error', 'User not found in public registry');
  END IF;

  -- 3. Resolve Role ID
  SELECT id INTO v_role_id FROM public.app_roles WHERE name = v_invitation.role;

  IF v_role_id IS NULL THEN
    IF v_invitation.role = 'client' THEN
      SELECT id INTO v_role_id FROM public.app_roles WHERE name = 'client';
    ELSE
      SELECT id INTO v_role_id FROM public.app_roles WHERE name = 'member';
    END IF;
  END IF;

  -- 4. LINK CLIENT (Specific for 'client' role)
  IF v_invitation.role = 'client' THEN
    -- Link the existing client record to the auth user
    UPDATE public.clients
    SET
      auth_user_id = p_auth_user_id,
      is_active = true,
      updated_at = now()
    WHERE
      email = v_invitation.email
      AND company_id = v_invitation.company_id;

    -- Only insert into company_members if the user has a public.users record
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.company_members (
        user_id,
        company_id,
        role_id,
        status
      ) VALUES (
        v_user_id,
        v_invitation.company_id,
        v_role_id,
        'active'
      )
      ON CONFLICT (user_id, company_id) DO UPDATE
      SET role_id = v_role_id, status = 'active', updated_at = now();

      -- Update users table context
      UPDATE public.users
      SET
        company_id = v_invitation.company_id,
        app_role_id = v_role_id,
        updated_at = now()
      WHERE id = v_user_id;
    END IF;

  ELSE
    -- For non-clients (admin/member), require and use the public.users record
    INSERT INTO public.company_members (
      user_id,
      company_id,
      role_id,
      status
    ) VALUES (
      v_user_id,
      v_invitation.company_id,
      v_role_id,
      'active'
    )
    ON CONFLICT (user_id, company_id) DO UPDATE
    SET role_id = v_role_id, status = 'active', updated_at = now();

    UPDATE public.users
    SET
      company_id = v_invitation.company_id,
      app_role_id = v_role_id,
      updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- 5. Mark Invitation as Accepted
  UPDATE public.company_invitations
  SET status = 'accepted', updated_at = now()
  WHERE id = v_invitation.id;

  RETURN json_build_object(
    'success', true,
    'company_id', v_invitation.company_id,
    'company_name', v_invitation.company_name,
    'role', v_invitation.role
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
