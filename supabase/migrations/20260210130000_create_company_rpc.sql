-- Create RPC to create company and owner atomically
CREATE OR REPLACE FUNCTION create_company_with_owner(
  p_name text,
  p_slug text,
  p_nif text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_owner_role_id uuid;
  v_app_user_id uuid;
BEGIN
  -- Get current auth user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify user exists in public.users
  SELECT id INTO v_app_user_id FROM public.users WHERE auth_user_id = v_user_id;
  
  -- If user doesn't exist, create it (should handle ensureAppUser logic partially?)
  -- Ideally ensureAppUser creates the user first. 
  -- But here we need the app_user_id (uuid) for company_members, not auth_user_id.
  
  IF v_app_user_id IS NULL THEN
    RAISE EXCEPTION 'User profile not found. Please ensure public.users record exists.';
  END IF;

  -- Get owner role id
  SELECT id INTO v_owner_role_id FROM app_roles WHERE name = 'owner';
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'Owner role not found';
  END IF;

  -- CHECK: User cannot be owner of another company
  IF EXISTS (
      SELECT 1 FROM company_members 
      WHERE user_id = v_app_user_id 
      AND role_id = v_owner_role_id
      AND status = 'active'
  ) THEN
      RAISE EXCEPTION 'User is already an owner of a company.';
  END IF;

  -- Insert Company
  INSERT INTO companies (name, slug, nif, is_active)
  VALUES (p_name, p_slug, p_nif, true)
  RETURNING id INTO v_company_id;

  -- Insert Member
  INSERT INTO company_members (user_id, company_id, role_id, status)
  VALUES (v_app_user_id, v_company_id, v_owner_role_id, 'active');
  
  -- Update User active company if needed (optional)
  UPDATE users SET company_id = v_company_id WHERE id = v_app_user_id AND company_id IS NULL;

  RETURN json_build_object(
    'id', v_company_id,
    'name', p_name,
    'slug', p_slug
  );
END;
$$;
