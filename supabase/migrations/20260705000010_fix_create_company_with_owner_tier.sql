-- Fix: create_company_with_owner must provide subscription_tier because
-- the column is NOT NULL since migration 20260705000001_plan_module_access.
-- Default to 'free' — the superadmin can upgrade the company later from
-- /admin/modulos → Empresas card → plan select.
--
-- Symptom: inviting a new owner through the accept-invitation flow surfaced
-- "No se pudo crear la empresa para esta invitación." because the silent
-- EXCEPTION WHEN OTHERS caught the NOT NULL violation and masked it.

CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  p_name text,
  p_slug text,
  p_nif text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_auth_user_id uuid;
  v_app_user_id uuid;
  v_owner_role_id uuid;
  v_auth_email text;
  v_given_name text;
  v_surname text;
BEGIN
  -- Get current auth user
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get auth user metadata
  SELECT
    au.email,
    COALESCE(au.raw_user_meta_data->>'given_name', split_part(au.raw_user_meta_data->>'full_name', ' ', 1), split_part(au.email, '@', 1)),
    COALESCE(au.raw_user_meta_data->>'surname', NULLIF(regexp_replace(au.raw_user_meta_data->>'full_name', '^[^\s]+\s*', ''), ''))
  INTO v_auth_email, v_given_name, v_surname
  FROM auth.users au
  WHERE au.id = v_auth_user_id;

  -- Ensure user exists in public.users
  SELECT id INTO v_app_user_id FROM public.users WHERE auth_user_id = v_auth_user_id;
  IF v_app_user_id IS NULL THEN
    INSERT INTO public.users (email, name, surname, active, auth_user_id, permissions)
    VALUES (v_auth_email, COALESCE(v_given_name, 'Usuario'), v_surname, true, v_auth_user_id, '{}'::jsonb)
    RETURNING id INTO v_app_user_id;
  END IF;

  -- Get owner role id
  SELECT id INTO v_owner_role_id FROM app_roles WHERE name = 'owner';
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Owner role not found in app_roles';
  END IF;

  -- Insert Company (subscription_tier is NOT NULL → default to 'free')
  INSERT INTO companies (name, slug, nif, is_active, subscription_tier)
  VALUES (p_name, p_slug, p_nif, true, 'free')
  RETURNING id INTO v_company_id;

  -- Insert Member
  INSERT INTO company_members (user_id, company_id, role_id, status)
  VALUES (v_app_user_id, v_company_id, v_owner_role_id, 'active');

  -- Update User's primary company (only if not already set)
  UPDATE users SET company_id = v_company_id WHERE id = v_app_user_id AND company_id IS NULL;

  RETURN json_build_object(
    'success', true,
    'id', v_company_id,
    'name', p_name,
    'slug', p_slug,
    'user_id', v_app_user_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_company_with_owner(text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
