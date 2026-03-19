-- ============================================================
-- SECURITY AUDIT: Miscellaneous fixes
-- Date: 2026-03-18
-- ============================================================

-- ============================================================
-- 1. Enable RLS on company_settings (missed in earlier migration)
-- ============================================================
ALTER TABLE IF EXISTS public.company_settings ENABLE ROW LEVEL SECURITY;

-- Basic RLS policy: members can read own company's settings
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_settings' AND table_schema = 'public') THEN
    EXECUTE $p$
      CREATE POLICY IF NOT EXISTS "company_settings_select_own"
        ON public.company_settings FOR SELECT
        USING (company_id IN (
          SELECT cm.company_id FROM public.company_members cm
          JOIN public.users u ON u.id = cm.user_id
          WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
        ));
    $p$;
    EXECUTE $p$
      CREATE POLICY IF NOT EXISTS "company_settings_update_own"
        ON public.company_settings FOR UPDATE
        USING (company_id IN (
          SELECT cm.company_id FROM public.company_members cm
          JOIN public.users u ON u.id = cm.user_id
          WHERE u.auth_user_id = auth.uid() AND cm.status = 'active'
        ));
    $p$;
  END IF;
END $$;

-- ============================================================
-- 2. Fix check_company_exists: remove PII (owner email/name)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_company_exists(p_company_name TEXT)
RETURNS TABLE(
  company_exists BOOLEAN,
  company_id UUID,
  company_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    TRUE as company_exists,
    c.id as company_id,
    c.name as company_name
  FROM public.companies c
  WHERE LOWER(c.name) = LOWER(p_company_name)
  LIMIT 1;

  -- If no row returned, return a single row with company_exists = false
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::uuid, NULL::text;
  END IF;
END;
$$;

-- ============================================================
-- 3. Fix broken RLS policies referencing non-existent public.profiles
-- ============================================================
-- Drop broken policies on domains table (reference public.profiles which doesn't exist)
DROP POLICY IF EXISTS "superadmin_full_access_domains" ON public.domains;

-- Recreate with correct table reference (public.users + public.app_roles)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'domains' AND table_schema = 'public') THEN
    EXECUTE $p$
      CREATE POLICY "superadmin_full_access_domains"
        ON public.domains FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM public.users u
            JOIN public.app_roles ar ON u.app_role_id = ar.id
            WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
          )
        );
    $p$;
  END IF;
END $$;

-- Same fix for domain_orders if it has the broken policy
DROP POLICY IF EXISTS "superadmin_full_access_domain_orders" ON public.domain_orders;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'domain_orders' AND table_schema = 'public') THEN
    EXECUTE $p$
      CREATE POLICY "superadmin_full_access_domain_orders"
        ON public.domain_orders FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM public.users u
            JOIN public.app_roles ar ON u.app_role_id = ar.id
            WHERE u.auth_user_id = auth.uid() AND ar.name = 'super_admin'
          )
        );
    $p$;
  END IF;
END $$;

-- ============================================================
-- 4. Tighten GRANT on company_members, domains, domain_orders
--    Revoke DELETE (should only be done via SECURITY DEFINER RPCs)
-- ============================================================
REVOKE DELETE ON public.company_members FROM authenticated;
REVOKE DELETE ON public.domains FROM authenticated;
REVOKE DELETE ON public.domain_orders FROM authenticated;
