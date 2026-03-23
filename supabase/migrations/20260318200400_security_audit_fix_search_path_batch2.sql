-- ============================================================
-- SECURITY AUDIT: Fix remaining SECURITY DEFINER functions missing SET search_path
-- Date: 2026-03-18
-- Risk: HIGH — Without SET search_path, a malicious caller can
--        manipulate search_path to hijack object resolution inside
--        SECURITY DEFINER functions, potentially escalating privileges.
-- All statements wrapped in DO/EXCEPTION blocks for idempotency.
-- ============================================================

-- 1. create_default_project_stages
DO $$ BEGIN
  ALTER FUNCTION public.create_default_project_stages(uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'create_default_project_stages(uuid) not found, skipping';
END $$;

-- 2. handle_project_auto_move (trigger function)
DO $$ BEGIN
  ALTER FUNCTION public.handle_project_auto_move() SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'handle_project_auto_move() not found, skipping';
END $$;

-- 3. process_client_consent — try 6-param version first, fall back to 4-param
DO $$ BEGIN
  ALTER FUNCTION public.process_client_consent(uuid, boolean, boolean, boolean, text, text) SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  BEGIN
    ALTER FUNCTION public.process_client_consent(uuid, boolean, text, text) SET search_path = public;
  EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'process_client_consent not found in any known signature, skipping';
  END;
END $$;

-- 4. reject_client_consent
DO $$ BEGIN
  ALTER FUNCTION public.reject_client_consent(uuid, text, text) SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'reject_client_consent(uuid, text, text) not found, skipping';
END $$;

-- 5. get_client_consent_request
DO $$ BEGIN
  ALTER FUNCTION public.get_client_consent_request(uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'get_client_consent_request(uuid) not found, skipping';
END $$;

-- 6. gdpr_export_client_data
DO $$ BEGIN
  ALTER FUNCTION public.gdpr_export_client_data(text, uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'gdpr_export_client_data(text, uuid) not found, skipping';
END $$;

-- 7. is_super_admin_by_id
DO $$ BEGIN
  ALTER FUNCTION public.is_super_admin_by_id(uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'is_super_admin_by_id(uuid) not found, skipping';
END $$;

-- 8. get_effective_modules
DO $$ BEGIN
  ALTER FUNCTION public.get_effective_modules(uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'get_effective_modules(uuid) not found, skipping';
END $$;

-- 9. admin_list_companies
DO $$ BEGIN
  ALTER FUNCTION public.admin_list_companies() SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'admin_list_companies() not found, skipping';
END $$;

-- 10. accept_company_invitation
DO $$ BEGIN
  ALTER FUNCTION public.accept_company_invitation(text, uuid) SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'accept_company_invitation(text, uuid) not found, skipping';
END $$;

-- 11. is_super_admin_real (belt-and-suspenders: also fixed in 20260318200100 but
--     later migrations may have re-created it without search_path)
DO $$ BEGIN
  ALTER FUNCTION public.is_super_admin_real() SET search_path = public;
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'is_super_admin_real() not found, skipping';
END $$;
