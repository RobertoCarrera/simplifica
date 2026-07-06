-- Fix: change_company_plan was not syncing companies.max_users with the
-- new plan's included_users. The UI shows the cap (e.g. "15 usuarios máx")
-- and it was stuck on the old plan's cap.
--
-- The existing function is REPLACEd. Two minimal changes:
--   1. Look up the new plan's included_users into a local v_included_users.
--   2. Add it to the UPDATE statement so the companies row's max_users
--      matches the new plan on the same write.

DROP FUNCTION IF EXISTS public.change_company_plan(uuid, text);

CREATE OR REPLACE FUNCTION public.change_company_plan(
  p_company_id uuid,
  p_new_tier   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role           text;
  v_old_tier       text;
  v_plan_count     integer;
  v_included_users integer;
BEGIN
  -- super_admin gate
  SELECT r.name INTO v_role
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required'
      USING ERRCODE = '42501';
  END IF;

  -- verify the company exists
  SELECT subscription_tier INTO v_old_tier
    FROM public.companies
   WHERE id = p_company_id;
  IF v_old_tier IS NULL THEN
    RAISE EXCEPTION 'company_not_found: %', p_company_id
      USING ERRCODE = 'P0002';
  END IF;

  -- validate the tier exists in plans AND pull its included_users in one
  -- round-trip so we update both fields atomically
  SELECT count(*), max(included_users) INTO v_plan_count, v_included_users
    FROM public.plans
   WHERE id = p_new_tier;
  IF v_plan_count = 0 THEN
    RAISE EXCEPTION 'invalid_tier: % is not a known plan', p_new_tier
      USING ERRCODE = '22023';
  END IF;

  -- update the company's tier AND its seat cap (NULL allowed by the
  -- column CHECK, but included_users is NOT NULL on plans so we always
  -- have a value here)
  UPDATE public.companies
     SET subscription_tier = p_new_tier,
         max_users         = v_included_users,
         updated_at        = now()
   WHERE id = p_company_id;

  -- sync grants (adds missing plan modules, respects manual revocations)
  PERFORM public.sync_plan_grants_for_company(p_company_id, p_new_tier);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.change_company_plan(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
