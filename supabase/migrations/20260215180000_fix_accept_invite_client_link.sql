-- Migration: Fix accept_company_invitation to link clients correctly
-- Corrects the issue where 'client' role invitations did not update the 'clients' table with auth_user_id

CREATE OR REPLACE FUNCTION accept_company_invitation(
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

  -- 2. Validate User (public.users)
  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = p_auth_user_id;
  
  IF v_user_id IS NULL THEN
     -- Fallback: If public.users trigger hasn't fired yet, we might need to retry or handle it.
     -- However, 'create-invited-user' ensures auth user is created, and trigger should be fast.
     RETURN json_build_object('success', false, 'error', 'User not found in public registry');
  END IF;

  -- 3. LINK CLIENT (Specific for 'client' role)
  IF v_invitation.role = 'client' THEN
      -- Link the existing client record to the new auth user
      UPDATE public.clients
      SET 
        auth_user_id = p_auth_user_id,
        is_active = true,
        updated_at = now()
      WHERE 
        email = v_invitation.email 
        AND company_id = v_invitation.company_id;
      
      -- We also add them to company_members to maintain consistency with the RPC contract,
      -- although the Portal mainly looks at 'clients' table.
      -- If we DON'T add them to company_members, some logic relying on check_is_member might fail?
      -- Safe bet: Add them, as they ARE members of the company (consumers).
      INSERT INTO public.company_members (
          user_id,
          company_id,
          role,
          status
      ) VALUES (
          v_user_id,
          v_invitation.company_id,
          v_invitation.role,
          'active'
      )
      ON CONFLICT (user_id, company_id) DO UPDATE
      SET role = v_invitation.role, status = 'active', updated_at = now();

  ELSE
      -- For non-clients (admin/member), strict company_members logic
      INSERT INTO public.company_members (
          user_id,
          company_id,
          role,
          status
      ) VALUES (
          v_user_id,
          v_invitation.company_id,
          v_invitation.role,
          'active'
      )
      ON CONFLICT (user_id, company_id) DO UPDATE
      SET role = v_invitation.role, status = 'active', updated_at = now();
  END IF;

  -- 4. Update users table (Context Switch)
  UPDATE public.users
  SET 
    company_id = v_invitation.company_id,
    role = v_invitation.role,
    updated_at = now()
  WHERE id = v_user_id;

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
