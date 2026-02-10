-- Fix all RPCs referencing deprecated 'users.role' column

-- 1. accept_company_invitation_admin
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

    SELECT name INTO company_name FROM public.companies WHERE id = inv.company_id;

    -- Map text role to role_id
    SELECT id INTO v_role_id FROM public.app_roles WHERE name = inv.role;
    IF v_role_id IS NULL THEN
        -- Fallback for legacy 'client' role if not in app_roles (should be there)
        IF inv.role = 'client' THEN
           SELECT id INTO v_role_id FROM public.app_roles WHERE name = 'client';
        END IF;
    END IF;

    SELECT * INTO existing_user FROM public.users WHERE auth_user_id = p_auth_user_id LIMIT 1;
    
    IF FOUND THEN
        -- Link existing user
        UPDATE public.users
           SET email = COALESCE(inv.email, existing_user.email),
               active = true,
               company_id = inv.company_id, -- Set primary company
               updated_at = NOW()
         WHERE id = existing_user.id
         RETURNING id INTO new_user_id;
    ELSE
        -- Helper logic for placeholder
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
            INSERT INTO public.users (
                email, name, surname, active, company_id, auth_user_id, permissions
            ) VALUES (
                inv.email,
                split_part(inv.email, '@', 1),
                NULL,
                true,
                inv.company_id,
                p_auth_user_id,
                '{}'::jsonb
            ) RETURNING id INTO new_user_id;
        END IF;
    END IF;

    -- Upsert Company Member
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

    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'company_id', inv.company_id,
        'company_name', company_name,
        'role', inv.role
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
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

-- 3. accept_company_invitation (Legacy/Generic)
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

  -- 2. Validate User
  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = p_auth_user_id;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  -- 3. Map Role
  SELECT id INTO v_role_id FROM public.app_roles WHERE name = v_invitation.role;

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
    UPDATE public.clients
    SET 
      auth_user_id = p_auth_user_id, 
      is_active = true,
      updated_at = NOW()
    WHERE email = v_invitation.email 
      AND company_id = v_invitation.company_id;
  END IF;

  -- 7. Mark Invitation as Accepted
  UPDATE public.company_invitations
  SET status = 'accepted', responded_at = NOW()
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

-- 4. invite_user_to_company
CREATE OR REPLACE FUNCTION invite_user_to_company(
    p_email text,
    p_company_id uuid,
    p_role text,
    p_message text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter_user_id uuid;
  inviter_role text; -- This will come from app_roles.name
  invitation_id uuid;
  company_name text;
BEGIN
  -- 1. Get Inviter ID and verify role via company_members + app_roles
  SELECT u.id, ar.name, c.name 
  INTO inviter_user_id, inviter_role, company_name
  FROM public.users u
  JOIN public.company_members cm ON cm.user_id = u.id
  JOIN public.app_roles ar ON cm.role_id = ar.id
  JOIN public.companies c ON c.id = cm.company_id
  WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = p_company_id
    AND cm.status = 'active'
    AND ar.name IN ('owner', 'admin');

  -- 2. Validate permissions
  IF inviter_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized: You must be an Owner or Admin of this company to invite users.');
  END IF;

  -- 3. Check if user already exists in the company
  IF EXISTS(
      SELECT 1 FROM public.users u
      JOIN public.company_members cm ON cm.user_id = u.id
      WHERE u.email = p_email 
      AND cm.company_id = p_company_id 
      AND cm.status = 'active'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'User already exists in this company');
  END IF;

  -- 4. Expire old pending invitations
  UPDATE public.company_invitations
  SET status = 'expired'
  WHERE email = p_email AND company_id = p_company_id AND status = 'pending';

  -- 5. Create new invitation
  INSERT INTO public.company_invitations (company_id, email, invited_by_user_id, role, message)
  VALUES (p_company_id, p_email, inviter_user_id, p_role, p_message)
  RETURNING id INTO invitation_id;

  RETURN json_build_object(
    'success', true, 
    'invitation_id', invitation_id, 
    'company_name', company_name, 
    'message', 'Invitation sent successfully'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. invite_user_to_company_debug (Fixing roles + Removing insert role into users)
CREATE OR REPLACE FUNCTION invite_user_to_company_debug(
    user_email text,
    user_name text,
    user_role text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_auth_uid UUID;
    current_user_company_id UUID;
    current_user_role TEXT;
    new_user_id UUID;
    debug_info JSON;
    v_role_id UUID;
BEGIN
    current_auth_uid := auth.uid();
    
    -- Authenticated User Context
    IF current_auth_uid IS NOT NULL THEN
        -- Get company and role via company_members
        SELECT cm.company_id, ar.name
        INTO current_user_company_id, current_user_role
        FROM public.users u
        JOIN public.company_members cm ON u.id = cm.user_id
        JOIN public.app_roles ar ON cm.role_id = ar.id
        WHERE u.auth_user_id = current_auth_uid
        AND cm.status = 'active'
        LIMIT 1;
    ELSE
        -- Fallback: Find first 'owner' (dangerous but this is debug func)
        SELECT cm.company_id, ar.name, u.auth_user_id
        INTO current_user_company_id, current_user_role, current_auth_uid
        FROM public.company_members cm
        JOIN public.app_roles ar ON cm.role_id = ar.id
        JOIN public.users u ON cm.user_id = u.id
        WHERE ar.name = 'owner' 
        AND u.active = true
        LIMIT 1;
    END IF;
    
    -- Assume company/role if NULL (Debug purposes validation)
    IF current_user_company_id IS NULL THEN
        SELECT id INTO current_user_company_id FROM public.companies WHERE is_active = true LIMIT 1;
        current_user_role := 'owner'; 
    END IF;
    
    debug_info := json_build_object(
        'auth_uid', current_auth_uid,
        'company_id', current_user_company_id,
        'user_role', current_user_role,
        'input_email', user_email,
        'input_name', user_name,
        'input_role', user_role
    );
    
    -- Check Exists
    IF EXISTS (SELECT 1 FROM public.users WHERE email = user_email AND deleted_at IS NULL) THEN
        RETURN json_build_object('success', false, 'error', 'El usuario ya existe en el sistema', 'debug', debug_info);
    END IF;
    
    -- Get Role ID
    SELECT id INTO v_role_id FROM public.app_roles WHERE name = user_role;
    IF v_role_id IS NULL THEN
          RETURN json_build_object('success', false, 'error', 'Role not found', 'debug', debug_info);
    END IF;

    -- Create User (without role column)
    INSERT INTO public.users (
        company_id, 
        email, 
        name, 
        active,
        permissions
    ) VALUES (
        current_user_company_id,
        user_email,
        user_name,
        true,
        '{"moduloFacturas": false, "moduloMaterial": false, "moduloServicios": false, "moduloPresupuestos": false}'::jsonb
    ) RETURNING id INTO new_user_id;
    
    -- Create Company Member
    INSERT INTO public.company_members (user_id, company_id, role_id, status)
    VALUES (new_user_id, current_user_company_id, v_role_id, 'active');

    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'company_id', current_user_company_id,
        'message', 'Usuario invitado correctamente',
        'debug', debug_info
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Error: ' || SQLERRM, 'sqlstate', SQLSTATE, 'debug', debug_info);
END;
$$;

-- 6. update_company_user
CREATE OR REPLACE FUNCTION update_company_user(
    p_user_id uuid,
    p_role text DEFAULT NULL,
    p_active boolean DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_id uuid;
    caller_role text;
    caller_company_id uuid;
    
    target_company_id uuid;
    target_role text;
    target_active boolean;
    
    v_new_role_id uuid;
BEGIN
    -- Get Caller Context
    SELECT u.id, ar.name, cm.company_id
    INTO caller_id, caller_role, caller_company_id
    FROM public.users u
    JOIN public.company_members cm ON u.id = cm.user_id
    JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND cm.status = 'active'
    LIMIT 1;

    IF caller_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no encontrado o inactivo');
    END IF;

    -- Get Target Context
    SELECT u.company_id, ar.name, u.active
    INTO target_company_id, target_role, target_active
    FROM public.users u
    LEFT JOIN public.company_members cm ON u.id = cm.user_id AND cm.company_id = caller_company_id
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE u.id = p_user_id;

    IF target_company_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Usuario objetivo no encontrado');
    END IF;

    -- Check Same Company
    IF caller_company_id != target_company_id THEN
        RETURN json_build_object('success', false, 'error', 'No tienes permisos para modificar usuarios de otra empresa');
    END IF;

    -- Check Caller Permissions
    IF caller_role NOT IN ('owner', 'admin') THEN
        RETURN json_build_object('success', false, 'error', 'Solo owner o admin pueden modificar usuarios');
    END IF;

    -- UPDATE ROLE
    IF p_role IS NOT NULL THEN
        -- Get new role ID
        SELECT id INTO v_new_role_id FROM public.app_roles WHERE name = p_role;
        IF v_new_role_id IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Rol no válido');
        END IF;

        -- Validations
        IF p_role = 'admin' AND caller_role != 'admin' AND caller_role != 'owner' THEN
             -- Actually owner can assign admin. Code said "only admin can assign admin"? 
             -- Logic: Owner > Admin > Member.
             -- Original Code: IF p_role = 'admin' AND caller.role != 'admin' (WRONG logic in original?)
             -- Revised Logic: Owner can do anything. Admin can assign Member/Admin but not Owner?
             -- Let's stick to strict: Owner and Admin can manage.
             NULL;
        END IF;
        
        -- Admin cannot assign Owner
        IF p_role = 'owner' AND caller_role = 'admin' THEN
            RETURN json_build_object('success', false, 'error', 'Un administrador no puede asignar el rol owner');
        END IF;
        
        -- Cannot change own role
        IF caller_id = p_user_id THEN
             RETURN json_build_object('success', false, 'error', 'No puedes cambiar tu propio rol');
        END IF;

        -- Admin cannot change Owner's role
        IF caller_role = 'admin' AND target_role = 'owner' THEN
             RETURN json_build_object('success', false, 'error', 'Un administrador no puede modificar el rol de un owner');
        END IF;

        -- Update Membership
        UPDATE public.company_members
        SET role_id = v_new_role_id, updated_at = NOW()
        WHERE user_id = p_user_id AND company_id = caller_company_id;
    END IF;

    -- UPDATE ACTIVE
    IF p_active IS NOT NULL THEN
        IF caller_id = p_user_id AND p_active = false THEN
            RETURN json_build_object('success', false, 'error', 'No puedes desactivarte a ti mismo');
        END IF;
        
        IF caller_role = 'admin' AND target_role = 'owner' AND p_active = false THEN
             RETURN json_build_object('success', false, 'error', 'Un administrador no puede desactivar a un owner');
        END IF;

        UPDATE public.users SET active = p_active WHERE id = p_user_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'user_id', p_user_id,
        'role', COALESCE(p_role, target_role),
        'active', COALESCE(p_active, target_active)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 7. confirm_user_registration
CREATE OR REPLACE FUNCTION confirm_user_registration(
    p_auth_user_id uuid,
    p_confirmation_token text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_user_data public.pending_users;
  existing_company_info RECORD;
  new_company_id UUID;
  new_user_id UUID;
  owner_user_id UUID;
  v_owner_role_id UUID;
  v_member_role_id UUID;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_auth_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO pending_user_data
  FROM public.pending_users
  WHERE auth_user_id = p_auth_user_id
    AND (p_confirmation_token IS NULL OR confirmation_token = p_confirmation_token)
    AND confirmed_at IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired confirmation');
  END IF;

  SELECT id INTO v_owner_role_id FROM public.app_roles WHERE name = 'owner';
  SELECT id INTO v_member_role_id FROM public.app_roles WHERE name = 'member';

  IF pending_user_data.company_name IS NOT NULL AND TRIM(pending_user_data.company_name) <> '' THEN
    SELECT * INTO existing_company_info
    FROM check_company_exists(pending_user_data.company_name);

    IF existing_company_info.company_exists THEN
      -- Find Owner using company_members + app_roles
      SELECT cm.user_id INTO owner_user_id
      FROM public.company_members cm
      JOIN public.app_roles ar ON cm.role_id = ar.id
      WHERE cm.company_id = existing_company_info.company_id 
        AND ar.name = 'owner' 
        AND cm.status = 'active'
      LIMIT 1;

      IF owner_user_id IS NOT NULL THEN
        -- Create Pending Invitation
        INSERT INTO public.company_invitations (company_id, email, invited_by_user_id, role, status, message)
        VALUES (existing_company_info.company_id, pending_user_data.email, owner_user_id, 'member', 'pending',
                'Solicitud automática generada durante el registro');

        UPDATE public.pending_users
        SET confirmed_at = NOW()
        WHERE auth_user_id = p_auth_user_id;

        RETURN json_build_object(
          'success', true,
          'requires_invitation_approval', true,
          'company_name', existing_company_info.company_name,
          'owner_email', existing_company_info.owner_email,
          'message', 'Company already exists. Invitation sent to company owner for approval.'
        );
      END IF;
    END IF;
  END IF;

  -- Create New Company
  INSERT INTO public.companies (name, slug, is_active)
  VALUES (
    COALESCE(NULLIF(TRIM(pending_user_data.company_name), ''), SPLIT_PART(pending_user_data.email, '@', 1)),
    LOWER(COALESCE(NULLIF(TRIM(pending_user_data.company_name), ''), SPLIT_PART(pending_user_data.email, '@', 1))) 
      || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
    true
  )
  RETURNING id INTO new_company_id;

  -- Create New User
  INSERT INTO public.users (email, name, surname, active, company_id, auth_user_id, permissions)
  VALUES (
    pending_user_data.email,
    COALESCE(NULLIF(pending_user_data.given_name, ''), split_part(pending_user_data.full_name, ' ', 1), split_part(pending_user_data.email, '@', 1)),
    COALESCE(NULLIF(pending_user_data.surname, ''), NULLIF(regexp_replace(pending_user_data.full_name, '^[^\\s]+\\s*', ''), '')),
    true,
    new_company_id,
    pending_user_data.auth_user_id,
    '{}'::jsonb
  )
  RETURNING id INTO new_user_id;
  
  -- Create Owner Membership
  INSERT INTO public.company_members (user_id, company_id, role_id, status)
  VALUES (new_user_id, new_company_id, v_owner_role_id, 'active');

  UPDATE public.pending_users
  SET confirmed_at = NOW()
  WHERE auth_user_id = p_auth_user_id;

  RETURN json_build_object('success', true, 'company_id', new_company_id, 'user_id', new_user_id, 'is_owner', true, 'message', 'Registration confirmed successfully. New company created.');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 8. get_company_schedule
CREATE OR REPLACE FUNCTION get_company_schedule(p_company_id uuid)
RETURNS TABLE (
    user_id uuid,
    day_of_week integer,
    start_time time without time zone,
    end_time time without time zone,
    is_unavailable boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_owner_id uuid;
BEGIN
    -- Find the owner of the company
    SELECT cm.user_id INTO v_owner_id
    FROM company_members cm
    JOIN app_roles ar ON cm.role_id = ar.id
    WHERE cm.company_id = p_company_id
    AND ar.name = 'owner'
    AND cm.status = 'active'
    LIMIT 1;

    IF v_owner_id IS NULL THEN
        RETURN; -- Return empty set if no owner found
    END IF;

    -- Return the owner's default schedule
    RETURN QUERY
    SELECT 
        s.user_id,
        s.day_of_week,
        s.start_time,
        s.end_time,
        s.is_unavailable
    FROM availability_schedules s
    WHERE s.user_id = v_owner_id
    AND s.booking_type_id IS NULL
    ORDER BY s.day_of_week, s.start_time;
END;
$$;

-- 9. get_verifactu_settings_for_company
CREATE OR REPLACE FUNCTION get_verifactu_settings_for_company(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Validar: Owner o Admin de la empresa
    IF NOT EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        JOIN public.app_roles ar ON cm.role_id = ar.id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = p_company_id
          AND ar.name IN ('owner', 'admin')
          AND cm.status = 'active'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'access_denied');
    END IF;
    
    SELECT jsonb_build_object(
        'ok', true,
        'software_code', vs.software_code,
        'software_name', vs.software_name,
        'software_version', vs.software_version,
        'issuer_nif', vs.issuer_nif,
        'environment', vs.environment,
        'is_active', vs.is_active,
        'cert_subject', vs.cert_subject,
        'cert_valid_from', vs.cert_valid_from,
        'cert_valid_to', vs.cert_valid_to,
        'has_certificate', (vs.cert_pem_enc IS NOT NULL)
    ) INTO v_result
    FROM public.verifactu_settings vs
    WHERE vs.company_id = p_company_id;
    
    IF v_result IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'exists', false, 'message', 'No configuration found');
    END IF;
    
    RETURN v_result;
END;
$$;

-- 10. upsert_verifactu_settings
CREATE OR REPLACE FUNCTION upsert_verifactu_settings(
    p_company_id uuid,
    p_software_code text,
    p_software_name text,
    p_software_version text,
    p_issuer_nif text,
    p_environment text,
    p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Validar: Owner o Admin de la empresa
    IF NOT EXISTS (
        SELECT 1 FROM public.company_members cm
        JOIN public.users u ON cm.user_id = u.id
        JOIN public.app_roles ar ON cm.role_id = ar.id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = p_company_id
          AND ar.name IN ('owner', 'admin')
          AND cm.status = 'active'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'access_denied');
    END IF;
    
    INSERT INTO public.verifactu_settings (
        company_id, software_code, software_name, software_version,
        issuer_nif, environment, is_active
    ) VALUES (
        p_company_id, p_software_code, p_software_name, p_software_version,
        p_issuer_nif, p_environment, p_is_active
    )
    ON CONFLICT (company_id) DO UPDATE SET
        software_code = COALESCE(EXCLUDED.software_code, verifactu_settings.software_code),
        software_name = COALESCE(EXCLUDED.software_name, verifactu_settings.software_name),
        software_version = COALESCE(EXCLUDED.software_version, verifactu_settings.software_version),
        issuer_nif = COALESCE(EXCLUDED.issuer_nif, verifactu_settings.issuer_nif),
        environment = COALESCE(EXCLUDED.environment, verifactu_settings.environment),
        is_active = COALESCE(EXCLUDED.is_active, verifactu_settings.is_active),
        updated_at = NOW();
    
    RETURN jsonb_build_object('ok', true);
END;
$$;
