-- Migration: Fix accept_company_invitation for users with no public.users profile (owner null-company invites)
-- Root cause: gestio@caibs.es has auth.users but no public.users row.
-- The RPC checked for users profile BEFORE the null-company early return,
-- blocking owner invites for users who were confirmed directly (not via Supabase invite flow).
-- Fix: move the null-company early return BEFORE the user profile check,
-- since for null company_id owner invites the user_id is never needed.

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

  -- 2. SUPER ADMIN OWNER INVITE (company_id is null) — handle early, no profile needed
  IF v_invitation.company_id IS NULL THEN
    UPDATE public.company_invitations SET status = 'accepted', responded_at = NOW() WHERE id = v_invitation.id;
    RETURN json_build_object(
      'success', true,
      'company', null,
      'company_id', null,
      'company_name', null,
      'role', v_invitation.role,
      'message', 'Owner invite accepted, proceed to onboarding'
    );
  END IF;

  -- 3. Validate User (only needed for regular company invites)
  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = p_auth_user_id;

  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  -- 4. Map Role
  SELECT id INTO v_role_id FROM public.app_roles WHERE name = v_invitation.role;

  -- Mark as accepted
  UPDATE public.company_invitations SET status = 'accepted', responded_at = NOW() WHERE id = v_invitation.id;

  -- 5. Insert into Company Members
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

  -- 6. Update users table (Legacy/Default Context)
  UPDATE public.users
  SET
    company_id = v_invitation.company_id,
    updated_at = NOW()
  WHERE id = v_user_id;

  -- 7. LINK CLIENT RECORD
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

  -- 8. Update pending users (if any)
  UPDATE public.pending_users
  SET confirmed_at = NOW(), company_id = v_invitation.company_id
  WHERE auth_user_id = p_auth_user_id AND email = v_invitation.email;

  RETURN json_build_object(
      'success', true,
      'company_id', v_invitation.company_id,
      'company_name', v_invitation.company_name,
      'role', v_invitation.role
  );
END;
$$;
