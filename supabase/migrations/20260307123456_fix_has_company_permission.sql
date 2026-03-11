-- Migration: Fix has_company_permission to work with role_id from app_roles
-- Date: 2026-03-07

CREATE OR REPLACE FUNCTION public.has_company_permission(p_company_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'temp'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get the internal user ID from public.users using the auth ID
  SELECT id INTO v_user_id
  FROM public.users
  WHERE auth_user_id = auth.uid();

  -- If no user found, deny access
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check permission using the internal user ID and app_roles table
  RETURN EXISTS (
    SELECT 1
    FROM public.company_members cm
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE cm.company_id = p_company_id
    AND cm.user_id = v_user_id
    AND ar.name = ANY(p_roles)
    AND cm.status = 'active'
  );
END;
$$;
