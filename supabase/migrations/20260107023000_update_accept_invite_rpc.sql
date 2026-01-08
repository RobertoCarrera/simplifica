-- Migration: Update accept_company_invitation RPC for Multi-Tenancy

create or replace function accept_company_invitation(
  p_invitation_token text,
  p_auth_user_id uuid
)
returns json
language plpgsql
security definer
as $$
declare
  v_invitation record;
  v_user_id uuid;
  v_company_name text;
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
  -- Only update if user has no current company or we want to switch them?
  -- Let's update it to ensure backward compat for now, 
  -- OR maybe only if it's null?
  -- Safe bet: Update it so they "switch" to this company context immediately upon accept.
  update public.users
  set 
    company_id = v_invitation.company_id,
    role = v_invitation.role,
    updated_at = now()
  where id = v_user_id;

  -- 5. Mark Invitation as Accepted
  update public.company_invitations
  set status = 'accepted', updated_at = now()
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
$$;
