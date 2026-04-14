-- RPC to list company members for the Usuarios tab (multi-company aware)
-- Uses SECURITY DEFINER to bypass RLS on users table (needed when a user's
-- primary company_id differs from the company they belong to via company_members)

CREATE OR REPLACE FUNCTION public.list_company_members(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result json;
BEGIN
  -- Validate caller is admin/owner of the company
  IF NOT current_user_is_admin(p_company_id) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT json_agg(row_to_json(t) ORDER BY t.name)
  INTO v_result
  FROM (
    SELECT u.id, u.email, u.name, u.surname, u.active,
           ar.name as role, p_company_id as company_id
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

GRANT EXECUTE ON FUNCTION public.list_company_members(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
