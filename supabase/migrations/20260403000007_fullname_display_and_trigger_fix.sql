-- Show full name (name + surname) in company members listing
-- For users without surname, shows name only (fallback to email username)
CREATE OR REPLACE FUNCTION public.list_company_members(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result json;
BEGIN
  IF NOT current_user_is_admin(p_company_id) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT json_agg(row_to_json(t) ORDER BY t.name)
  INTO v_result
  FROM (
    SELECT
      u.id,
      u.email,
      TRIM(
        u.name ||
        CASE WHEN u.surname IS NOT NULL AND u.surname != ''
             THEN ' ' || u.surname
             ELSE ''
        END
      ) AS name,
      u.surname,
      u.active,
      ar.name AS role,
      p_company_id AS company_id
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    JOIN app_roles ar ON ar.id = cm.role_id
    WHERE cm.company_id = p_company_id
      AND cm.status = 'active'
      AND ar.name IN ('owner', 'admin', 'member', 'professional', 'agent')
  ) t;

  RETURN json_build_object('success', true, 'users', COALESCE(v_result, '[]'::json));
END;
$$;

-- Fix handle_new_user to prefer full_name, then first_name+last_name, then email username
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'temp'
AS $$
BEGIN
  INSERT INTO public.users (id, auth_user_id, email, name, active)
  VALUES (
    new.id,
    new.id,
    new.email,
    COALESCE(
      NULLIF(new.raw_user_meta_data->>'full_name', ''),
      NULLIF(TRIM(
        COALESCE(new.raw_user_meta_data->>'first_name', '') ||
        CASE WHEN new.raw_user_meta_data->>'last_name' IS NOT NULL AND new.raw_user_meta_data->>'last_name' != ''
             THEN ' ' || (new.raw_user_meta_data->>'last_name')
             ELSE ''
        END
      ), ''),
      split_part(new.email, '@', 1)
    ),
    true
  );
  RETURN new;
END;
$$;

NOTIFY pgrst, 'reload schema';
