-- ============================================================
-- SECURITY AUDIT: Fix SECURITY DEFINER functions missing SET search_path
-- Date: 2026-03-18
-- Risk: HIGH — Without SET search_path, a malicious caller can
--        manipulate search_path to hijack object resolution inside
--        SECURITY DEFINER functions, potentially escalating privileges.
-- Ref: https://www.postgresql.org/docs/current/sql-createfunction.html
-- ============================================================

-- Fix: public.my_company_id() — used in domains RLS policies
CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- Fix: public.is_super_admin_real() — used in users RLS policies
CREATE OR REPLACE FUNCTION public.is_super_admin_real()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name = 'super_admin'
  );
END;
$$;

-- Fix: check_company_exists — created by database-migration.service.ts
-- Recreate with SET search_path if it exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_company_exists') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.check_company_exists(p_company_name TEXT)
      RETURNS TABLE(
        company_exists BOOLEAN,
        company_id UUID,
        company_name TEXT,
        owner_email TEXT,
        owner_name TEXT
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      BEGIN
        RETURN QUERY
        SELECT
          EXISTS(SELECT 1 FROM public.companies WHERE LOWER(name) = LOWER(p_company_name)) as company_exists,
          c.id as company_id,
          c.name as company_name,
          u.email as owner_email,
          u.name as owner_name
        FROM public.companies c
        LEFT JOIN public.users u ON u.company_id = c.id AND u.role = 'owner' AND u.active = true
        WHERE LOWER(c.name) = LOWER(p_company_name)
        LIMIT 1;
      END;
      $body$;
    $fn$;
  END IF;
END $$;

-- Fix: is_dev_user — if it exists, add search_path (or drop it since dev-only)
DROP FUNCTION IF EXISTS public.is_dev_user(text);

-- Fix: get_user_permissions — if it exists, drop (dev-only function, security risk)
DROP FUNCTION IF EXISTS public.get_user_permissions(text);

-- ============================================================
-- Fix domains.company_id: backfill NULLs and add NOT NULL
-- ============================================================
-- First, delete orphaned domains that have no company assignment
-- (these are unreachable via RLS anyway)
DELETE FROM public.domains WHERE company_id IS NULL;

-- Now enforce NOT NULL going forward
DO $$ BEGIN
  ALTER TABLE public.domains ALTER COLUMN company_id SET NOT NULL;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Could not set domains.company_id NOT NULL: %', SQLERRM;
END $$;
