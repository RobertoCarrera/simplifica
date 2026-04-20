-- Migration: Fix accept_company_invitation LEFT JOIN company
--
-- Bug: INNER JOIN on public.companies causes the query to return no rows
-- when the invitation's company_id references a company that has been deleted
-- or is otherwise not found (e.g., stale/wrong company_id).
-- This makes the invitation appear as "Invalid or expired" even when it is valid.
--
-- Fix: Change JOIN → LEFT JOIN so the invitation is found regardless of whether
-- the company record exists. company_name will be NULL in that edge case.

CREATE OR REPLACE FUNCTION public.accept_company_invitation(p_invitation_token text, p_auth_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invitation record;
  v_user_id uuid;
  v_role_id uuid;
  v_existing_company_id uuid;
  v_auth_email text;
  v_caller_auth_uid uuid;
BEGIN
  -- SECURITY: Validate caller owns this auth_user_id
  v_caller_auth_uid := auth.uid();
  IF v_caller_auth_uid IS NULL OR v_caller_auth_uid != p_auth_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Forbidden: you can only accept invitations for your own account');
  END IF;

  -- 1. Validate invitation (must be pending)
  --    LEFT JOIN so a missing company does NOT discard a valid invitation
  SELECT i.*, c.name as company_name
  INTO v_invitation
  FROM public.company_invitations i
  LEFT JOIN public.companies c ON c.id = i.company_id
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
  SET status = 'accepted', responded_at = now()
  WHERE id = v_invitation.id;

  RETURN json_build_object(
    'success', true,
    'company_id', v_invitation.company_id,
    'company_name', v_invitation.company_name,
    'role', v_invitation.role
  );
END;
$function$;
