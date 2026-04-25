-- Migration: Add support for company_id IS NULL in invitations (for Super Admin inviting complete isolated owners)

-- 1. accept_company_invitation
CREATE OR REPLACE FUNCTION accept_company_invitation(
    p_invitation_token text,
    p_auth_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation record;
  v_user_id uuid;
  v_company_name text;
  v_role_id uuid;
BEGIN
  -- 1. Validate Invitation (support NULL company_id via LEFT JOIN)
  SELECT i.*, c.name as company_name
  INTO v_invitation
  FROM public.company_invitations i
  LEFT JOIN public.companies c ON c.id = i.company_id
  WHERE i.token = p_invitation_token
    AND i.status = 'pending';

  IF v_invitation.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- 2. Validate User
  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = p_auth_user_id;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  -- 3. Map Role
  SELECT id INTO v_role_id FROM public.app_roles WHERE name = v_invitation.role;

  -- Mark as accepted
  UPDATE public.company_invitations SET status = 'accepted' WHERE id = v_invitation.id;

  -- SUPER ADMIN OWNER INVITE (company_id is null)
  IF v_invitation.company_id IS NULL THEN
     -- Just return success without inserting into company_members
     RETURN json_build_object(
        'success', true, 
        'company', null, 
        'role', v_invitation.role, 
        'message', 'Owner invite accepted, proceed to onboarding'
     );
  END IF;

  -- 4. Insert into Company Members
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
  SET role_id = v_role_id, status = 'active', updated_at = NOW();

  -- 5. Update users table (Legacy/Default Context)
  UPDATE public.users
  SET
    company_id = v_invitation.company_id,
    updated_at = NOW()
  WHERE id = v_user_id;

  -- 6. LINK CLIENT RECORD
  IF v_invitation.role = 'client' THEN
    DECLARE v_client_id uuid;
    BEGIN
      SELECT id INTO v_client_id
      FROM public.clients 
      WHERE email = v_invitation.email AND company_id = v_invitation.company_id
      LIMIT 1;
      
      IF v_client_id IS NOT NULL THEN
        UPDATE public.users SET client_id = v_client_id WHERE id = v_user_id;
      END IF;
    END;
  END IF;

  -- 7. Update pending users (if any)
  UPDATE public.pending_users
  SET confirmed_at = NOW(), company_id = v_invitation.company_id
  WHERE auth_user_id = p_auth_user_id AND email = v_invitation.email;

  RETURN json_build_object(
      'success', true,
      'company', json_build_object('id', v_invitation.company_id, 'name', v_invitation.company_name),
      'role', v_invitation.role
  );
END;
$$;


-- 2. accept_company_invitation_by_email
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
    UPDATE public.users
    SET email = COALESCE(inv.email, existing_user.email),
        active = true,
        company_id = inv.company_id,
        updated_at = NOW()
    WHERE id = existing_user.id
    RETURNING id INTO new_user_id;
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

  -- Upsert Membership
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


-- 3. accept_company_invitation_admin
CREATE OR REPLACE FUNCTION accept_company_invitation_admin(
    p_invitation_token text,
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
    SELECT * INTO inv
    FROM public.company_invitations
    WHERE token = p_invitation_token
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
    END IF;

    IF inv.company_id IS NULL THEN
        UPDATE public.company_invitations SET status = 'accepted', responded_at = NOW() WHERE id = inv.id;
        RETURN json_build_object('success', true, 'company_id', null, 'company_name', null, 'role', inv.role, 'message', 'Owner invite accepted successfully');
    END IF;

    SELECT name INTO company_name FROM public.companies WHERE id = inv.company_id;

    -- Map text role to role_id
    SELECT id INTO v_role_id FROM public.app_roles WHERE name = inv.role;
    IF v_role_id IS NULL THEN
        IF inv.role = 'client' THEN
           SELECT id INTO v_role_id FROM public.app_roles WHERE name = 'client';
        END IF;
    END IF;

    SELECT * INTO existing_user FROM public.users WHERE auth_user_id = p_auth_user_id LIMIT 1;

    IF FOUND THEN
        UPDATE public.users
           SET email = COALESCE(inv.email, existing_user.email),
               active = true,
               company_id = inv.company_id,
               updated_at = NOW()
         WHERE id = existing_user.id
         RETURNING id INTO new_user_id;
    ELSE
        SELECT * INTO placeholder_user
          FROM public.users
         WHERE email = inv.email AND company_id = inv.company_id
         LIMIT 1;
         
        IF FOUND THEN
            UPDATE public.users
               SET auth_user_id = p_auth_user_id,
                   active = true,
                   updated_at = NOW()
             WHERE id = placeholder_user.id
             RETURNING id INTO new_user_id;
        ELSE
            -- Crear nuevo usuario si no existe
            INSERT INTO public.users (email, name, active, company_id, auth_user_id)
            VALUES (inv.email, split_part(inv.email, '@', 1), true, inv.company_id, p_auth_user_id)
            RETURNING id INTO new_user_id;
        END IF;
    END IF;

    -- Update membership
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

    RETURN json_build_object('success', true, 'user_id', new_user_id, 'company_id', inv.company_id, 'company_name', company_name, 'role', inv.role, 'message', 'Admin invite accepted');
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
