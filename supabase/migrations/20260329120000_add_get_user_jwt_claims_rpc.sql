-- Migration: Add get_user_jwt_claims RPC
-- Replaces two sequential queries in the custom-access-token hook with a single DB call.
-- This reduces cold-start hook time from >5s (timeout 422) to <500ms.

CREATE OR REPLACE FUNCTION public.get_user_jwt_claims(p_auth_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_role       text;
BEGIN
  -- 1. Check internal users (staff/admin/owner) first
  SELECT u.company_id, ar.name
  INTO v_company_id, v_role
  FROM public.users u
  LEFT JOIN public.app_roles ar ON ar.id = u.app_role_id
  WHERE u.auth_user_id = p_auth_user_id
  LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    RETURN json_build_object(
      'company_id', v_company_id::text,
      'user_role',  COALESCE(v_role, 'member')
    );
  END IF;

  -- 2. Check portal clients
  SELECT company_id
  INTO v_company_id
  FROM public.clients
  WHERE auth_user_id = p_auth_user_id
    AND is_active = true
  LIMIT 1;

  IF v_company_id IS NOT NULL THEN
    RETURN json_build_object(
      'company_id', v_company_id::text,
      'user_role',  'client'
    );
  END IF;

  RETURN json_build_object('company_id', null, 'user_role', null);
END;
$$;

-- Grant execute to service_role (used by the edge function)
GRANT EXECUTE ON FUNCTION public.get_user_jwt_claims(uuid) TO service_role;
