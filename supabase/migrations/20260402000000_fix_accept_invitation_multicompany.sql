-- Migration: Fix accept_company_invitation for multi-company memberships
-- 
-- Problems fixed:
-- 1. Existing users: UPDATE public.users SET company_id = v_invitation.company_id
--    was OVERWRITING their primary company. Now only sets company_id if currently NULL.
-- 2. New invited users (no public.users record): was returning error 'User not found'.
--    Now auto-creates a minimal public.users record and proceeds normally.
--
-- After this fix, accepting an invitation:
-- - Adds a company_members entry for the new company
-- - Leaves the user's primary company_id untouched if they already have one
-- - The sidebar company switcher will automatically show both companies

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
  v_existing_company_id uuid;
  v_auth_email text;
BEGIN
  -- 1. Validate invitation (must be pending)
  SELECT i.*, c.name as company_name
  INTO v_invitation
  FROM public.company_invitations i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.token = p_invitation_token
    AND i.status = 'pending';

  IF v_invitation.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- 2. Look up public.users record
  SELECT id, company_id
  INTO v_user_id, v_existing_company_id
  FROM public.users
  WHERE auth_user_id = p_auth_user_id;

  -- 3. For non-client roles: auto-create public.users if missing (invited users without prior account)
  IF v_user_id IS NULL AND v_invitation.role != 'client' THEN
    SELECT email INTO v_auth_email FROM auth.users WHERE id = p_auth_user_id;
    INSERT INTO public.users (auth_user_id, email, active)
    VALUES (p_auth_user_id, COALESCE(v_auth_email, v_invitation.email), true)
    RETURNING id, company_id INTO v_user_id, v_existing_company_id;
  END IF;

  -- 4. Resolve role ID (fall back to 'member' if role name not found)
  SELECT id INTO v_role_id FROM public.app_roles WHERE name = v_invitation.role;
  IF v_role_id IS NULL THEN
    SELECT id INTO v_role_id FROM public.app_roles
    WHERE name = CASE WHEN v_invitation.role = 'client' THEN 'client' ELSE 'member' END;
  END IF;

  -- 5a. Client role: link clients record + optionally add company_members
  IF v_invitation.role = 'client' THEN
    UPDATE public.clients
    SET auth_user_id = p_auth_user_id, is_active = true, updated_at = now()
    WHERE email = v_invitation.email AND company_id = v_invitation.company_id;

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.company_members (user_id, company_id, role_id, status)
      VALUES (v_user_id, v_invitation.company_id, v_role_id, 'active')
      ON CONFLICT (user_id, company_id) DO UPDATE
      SET role_id = v_role_id, status = 'active', updated_at = now();

      -- Only set primary company if user had none
      UPDATE public.users
      SET company_id = v_invitation.company_id, app_role_id = v_role_id, updated_at = now()
      WHERE id = v_user_id AND company_id IS NULL;
    END IF;

  -- 5b. Staff role: add membership WITHOUT overwriting existing primary company
  ELSE
    INSERT INTO public.company_members (user_id, company_id, role_id, status)
    VALUES (v_user_id, v_invitation.company_id, v_role_id, 'active')
    ON CONFLICT (user_id, company_id) DO UPDATE
    SET role_id = v_role_id, status = 'active', updated_at = now();

    -- Only set primary company + role if user had no company yet (new users)
    UPDATE public.users
    SET company_id = v_invitation.company_id, app_role_id = v_role_id, updated_at = now()
    WHERE id = v_user_id AND company_id IS NULL;
  END IF;

  -- 6. Mark invitation accepted
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
