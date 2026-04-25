-- Migration: Fix User ID mapping in RLS helper functions
-- Date: 2026-01-07 03:45:00

-- 1. Update has_company_permission to map auth.uid() -> public.users.id
CREATE OR REPLACE FUNCTION public.has_company_permission(p_company_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Check permission using the internal user ID
  RETURN EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE company_id = p_company_id
    AND user_id = v_user_id
    AND role = ANY(p_roles)
    AND status = 'active'
  );
END;
$$;

-- 2. Update is_company_member to map auth.uid() -> public.users.id
CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Check membership using the internal user ID
  RETURN EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE company_id = p_company_id
    AND user_id = v_user_id
    AND status = 'active'
  );
END;
$$;
