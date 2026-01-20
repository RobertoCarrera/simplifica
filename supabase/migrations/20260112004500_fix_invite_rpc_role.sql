-- Fix invite_user_to_company to use company_members for role check
-- Legacy users.role column is gone.

CREATE OR REPLACE FUNCTION public.invite_user_to_company(p_company_id uuid, p_email text, p_role text DEFAULT 'member'::text, p_message text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  inviter_user_id UUID;
  inviter_role TEXT;
  invitation_id UUID;
  company_name TEXT;
BEGIN
  -- 1. Get Inviter ID and verify role via company_members
  SELECT u.id, cm.role, c.name 
  INTO inviter_user_id, inviter_role, company_name
  FROM public.users u
  JOIN public.company_members cm ON cm.user_id = u.id
  JOIN public.companies c ON c.id = cm.company_id
  WHERE u.auth_user_id = auth.uid()
    AND cm.company_id = p_company_id
    AND cm.status = 'active'
    AND cm.role IN ('owner', 'admin');

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

  -- 4. Expire old pending invitations for this email/company
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
$function$;
