-- Migration: Update register_new_owner_from_invite to handle race conditions
-- Date: 2026-01-08 18:00:00

create or replace function register_new_owner_from_invite(
  p_invitation_token text,
  p_company_name text,
  p_company_nif text,
  p_user_name text,
  p_user_surname text
)
returns json
language plpgsql
security definer
as $$
declare
  v_invitation record;
  v_new_company_id uuid;
  v_user_id uuid;
  v_auth_user_id uuid;
begin
  -- 1. Get current auth user
  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    return json_build_object('success', false, 'error', 'Not authenticated');
  end if;

  -- 2. Validate Invitation
  select * into v_invitation
  from public.company_invitations
  where token = p_invitation_token
    and status = 'pending'
    and role = 'owner'; -- Must be an owner invite

  if v_invitation.id is null then
    return json_build_object('success', false, 'error', 'Invitation not found or invalid');
  end if;

  -- 3. Create New Company
  insert into public.companies (name, nif)
  values (p_company_name, p_company_nif)
  returning id into v_new_company_id;

  -- 4. Create/Update Public User
  -- Use ON CONFLICT to handle race condition with on_auth_user_created trigger
  insert into public.users (
      auth_user_id,
      company_id, -- Legacy
      role,       -- Legacy
      name,
      surname,
      email,
      active
  )
  values (
      v_auth_user_id,
      v_new_company_id,
      'owner',
      p_user_name,
      p_user_surname,
      v_invitation.email,
      true
  )
  on conflict (auth_user_id) do update
  set 
      company_id = v_new_company_id,
      role = 'owner',
      name = p_user_name,
      surname = p_user_surname,
      active = true,
      updated_at = now()
  returning id into v_user_id;

  -- 5. Insert into Company Members (Multi-Tenancy)
  insert into public.company_members (
      user_id,
      company_id,
      role,
      status
  ) values (
      v_user_id,
      v_new_company_id,
      'owner',
      'active'
  )
  on conflict (user_id, company_id) do update
  set role = 'owner', status = 'active', updated_at = now();

  -- 6. Mark Invitation as Accepted
  update public.company_invitations
  set 
    status = 'accepted',
    updated_at = now()
  where id = v_invitation.id;

  return json_build_object(
    'success', true,
    'company_id', v_new_company_id,
    'user_id', v_user_id
  );

exception when others then
  -- Return error to client (caught by PortalInviteComponent now)
  return json_build_object('success', false, 'error', SQLERRM);
end;
$$;
