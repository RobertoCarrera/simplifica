-- Migration: Create list_company_devices RPC
-- Description: Securely lists devices for a given company.
-- Access: 
--   - Staff: Can see all devices for the company.
--   - Client: Can see ONLY devices belonging to them (client_id match).

CREATE OR REPLACE FUNCTION public.list_company_devices(
  p_company_id uuid
)
RETURNS SETOF public.devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid;
  v_is_staff boolean := false;
  v_acting_client_id uuid;
BEGIN
  v_auth_user_id := auth.uid();
  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check Staff
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_user_id = v_auth_user_id 
    AND company_id = p_company_id 
    AND active = true
  ) INTO v_is_staff;

  IF NOT v_is_staff THEN
    -- Check Client
    SELECT id INTO v_acting_client_id
    FROM public.clients
    WHERE auth_user_id = v_auth_user_id 
    AND company_id = p_company_id 
    AND is_active = true;

    IF v_acting_client_id IS NULL THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  -- Return Data
  RETURN QUERY
  SELECT d.*
  FROM public.devices d
  WHERE d.company_id = p_company_id
  AND (
    v_is_staff = true 
    OR 
    (v_acting_client_id IS NOT NULL AND d.client_id = v_acting_client_id)
  );

END;
$$;
