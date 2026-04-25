-- Fix: accept_company_invitation and reject_company_invitation reference
-- non-existent column "updated_at" on company_invitations table.
-- The correct column is "responded_at".

-- 1. Fix reject_company_invitation
CREATE OR REPLACE FUNCTION public.reject_company_invitation(p_token text, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation_id UUID;
BEGIN
  UPDATE company_invitations
  SET status = 'rejected', responded_at = NOW()
  WHERE token = p_token AND status = 'pending'
  RETURNING id INTO v_invitation_id;

  IF v_invitation_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found or already processed');
  END IF;

  RETURN json_build_object('success', true, 'invitation_id', v_invitation_id);
END;
$function$;

-- 2. Fix accept_company_invitation (step 6 references updated_at on company_invitations)
CREATE OR REPLACE FUNCTION public.accept_company_invitation(p_invitation_token text, p_auth_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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

  -- 3. For non-client roles: auto-create public.users if missing
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

  -- 6. Mark invitation accepted (FIX: responded_at, not updated_at)
  UPDATE public.company_invitations
  SET status = 'accepted', responded_at = now()
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
$function$;

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.reject_company_invitation(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_company_invitation(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.reject_company_invitation(text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(text, uuid) TO service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
