CREATE OR REPLACE FUNCTION public.accept_company_invitation(p_invitation_token text, p_auth_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_invitation record;
  v_user_id uuid;
  v_company_name text;
  v_client_record_id uuid;
begin
  -- 1. Validate Invitation
  select i.*, c.name as company_name
  into v_invitation
  from public.company_invitations i
  join public.companies c on c.id = i.company_id
  where i.token = p_invitation_token
    and i.status = 'pending';

  if v_invitation.id is null then
    return json_build_object('success', false, 'error', 'Invalid or expired invitation');
  end if;

  -- 2. Validate User
  select id into v_user_id from public.users where auth_user_id = p_auth_user_id;

  if v_user_id is null then
    return json_build_object('success', false, 'error', 'User not found');
  end if;

  -- 3. Insert into Company Members
  insert into public.company_members (
      user_id,
      company_id,
      role,
      status
  ) values (
      v_user_id,
      v_invitation.company_id,
      v_invitation.role,
      'active'
  )
  on conflict (user_id, company_id) do update
  set role = v_invitation.role, status = 'active', updated_at = now();

  -- 4. Update users table (Legacy/Default Context)
  update public.users
  set 
    company_id = v_invitation.company_id,
    updated_at = now()
  where id = v_user_id;

  -- 5. LINK CLIENT RECORD (Fix for "Client record not found")
  -- If the invitation is for a 'client' role, we must link the clients table
  if v_invitation.role = 'client' then
    update public.clients
    set 
      auth_user_id = p_auth_user_id, -- Link to Auth User
      is_active = true,
      updated_at = now()
    where email = v_invitation.email 
      and company_id = v_invitation.company_id;
      
    -- Also update client_portal_users view source if needed, but clients is the source of truth for AuthService
  end if;

  -- 6. Mark Invitation as Accepted
  update public.company_invitations
  set status = 'accepted', responded_at = now()
  where id = v_invitation.id;

  return json_build_object(
    'success', true,
    'company_id', v_invitation.company_id,
    'company_name', v_invitation.company_name,
    'role', v_invitation.role
  );
exception when others then
  return json_build_object('success', false, 'error', SQLERRM);
end;
$function$
