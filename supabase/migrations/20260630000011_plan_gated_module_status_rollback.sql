-- Rollback for 20260630000011_plan_gated_module_status.sql
-- Restores the previous admin_set_company_module without the plan
-- check (so super_admin can set any module status again).

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_company_module(
  p_target_company_id uuid,
  p_module_key        text,
  p_status            text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_user_role_name text;
  v_user_company_id uuid;
BEGIN
  SELECT r.name, u.company_id
    INTO v_user_role_name, v_user_company_id
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();

  IF v_user_role_name = 'super_admin' THEN
    -- Allowed
  ELSIF v_user_role_name = 'owner' AND v_user_company_id = p_target_company_id THEN
    -- Allowed
  ELSE
    RAISE EXCEPTION 'Access Denied: Insufficient permissions to set company module';
  END IF;

  INSERT INTO public.company_modules (company_id, module_key, status, updated_at)
  VALUES (p_target_company_id, p_module_key, p_status, now())
  ON CONFLICT (company_id, module_key)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_set_company_module(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;