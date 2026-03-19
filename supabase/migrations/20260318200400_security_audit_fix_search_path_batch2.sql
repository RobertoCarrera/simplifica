-- ============================================================
-- SECURITY AUDIT: Fix remaining SECURITY DEFINER functions missing SET search_path
-- Date: 2026-03-18
-- Risk: HIGH — Without SET search_path, a malicious caller can
--        manipulate search_path to hijack object resolution inside
--        SECURITY DEFINER functions, potentially escalating privileges.
-- ============================================================

-- 1. create_default_project_stages
ALTER FUNCTION public.create_default_project_stages(uuid) SET search_path = public;

-- 2. handle_project_auto_move (trigger function)
ALTER FUNCTION public.handle_project_auto_move() SET search_path = public;

-- 3. process_client_consent (latest version with 6 params)
ALTER FUNCTION public.process_client_consent(uuid, boolean, boolean, boolean, text, text) SET search_path = public;

-- 4. reject_client_consent
ALTER FUNCTION public.reject_client_consent(uuid, text, text) SET search_path = public;

-- 5. get_client_consent_request
ALTER FUNCTION public.get_client_consent_request(uuid) SET search_path = public;

-- 6. gdpr_export_client_data
ALTER FUNCTION public.gdpr_export_client_data(text, uuid) SET search_path = public;

-- 7. is_super_admin_by_id
ALTER FUNCTION public.is_super_admin_by_id(uuid) SET search_path = public;

-- 8. get_effective_modules
ALTER FUNCTION public.get_effective_modules(uuid) SET search_path = public;

-- 9. admin_list_companies
ALTER FUNCTION public.admin_list_companies() SET search_path = public;

-- 10. accept_company_invitation
ALTER FUNCTION public.accept_company_invitation(text, uuid) SET search_path = public;

-- 11. is_super_admin_real (belt-and-suspenders: also fixed in 20260318200100 but
--     later migrations may have re-created it without search_path)
ALTER FUNCTION public.is_super_admin_real() SET search_path = public;
