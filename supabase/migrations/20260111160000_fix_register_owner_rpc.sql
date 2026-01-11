-- Fix register_new_owner_from_invite to work with app_roles table
-- Replaces legacy text 'role' columns with FKs to app_roles

CREATE OR REPLACE FUNCTION public.register_new_owner_from_invite(
  p_invitation_token text,
  p_company_name text,
  p_company_nif text,
  p_user_name text,
  p_user_surname text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_invitation record;
  v_new_company_id uuid;
  v_user_id uuid;
  v_auth_user_id uuid;
  v_owner_role_id uuid;
BEGIN
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

  -- 3. Get Owner Role ID
  select id into v_owner_role_id from public.app_roles where name = 'owner';
  if v_owner_role_id is null then
      return json_build_object('success', false, 'error', 'Owner role configuration missing in database');
  end if;

  -- 4. Create New Company
  insert into public.companies (name, nif)
  values (p_company_name, p_company_nif)
  returning id into v_new_company_id;

  -- 5. Create/Update Public User
  -- Use ON CONFLICT to handle race condition with on_auth_user_created trigger
  insert into public.users (
      auth_user_id,
      company_id, 
      app_role_id, -- New column
      name,
      surname,
      email,
      active
  )
  values (
      v_auth_user_id,
      v_new_company_id,
      v_owner_role_id,
      p_user_name,
      p_user_surname,
      v_invitation.email,
      true
  )
  on conflict (auth_user_id) do update
  set 
      company_id = v_new_company_id,
      app_role_id = v_owner_role_id,
      name = p_user_name,
      surname = p_user_surname,
      active = true,
      updated_at = now()
  returning id into v_user_id;

  -- 6. Insert into Company Members (Multi-Tenancy)
  insert into public.company_members (
      user_id,
      company_id,
      role_id, -- New column
      role,    -- Legacy column (REQUIRED per NOT NULL constraint)
      status
  ) values (
      v_user_id,
      v_new_company_id,
      v_owner_role_id,
      'owner', -- Explicitly set legacy role
      'active'
  )
  on conflict (user_id, company_id) do update
  set 
    role_id = v_owner_role_id, 
    role = 'owner', 
    status = 'active', 
    updated_at = now();

  -- 7. Mark Invitation as Accepted
  update public.company_invitations
  set 
    status = 'accepted',
    responded_at = now()
  where id = v_invitation.id;

  return json_build_object(
    'success', true,
    'company_id', v_new_company_id,
    'user_id', v_user_id
  );

exception when others then
  return json_build_object('success', false, 'error', SQLERRM);
end;
$function$;
