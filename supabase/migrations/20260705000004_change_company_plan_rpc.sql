-- change_company_plan RPC for the superadmin UI.
-- Lets the admin move a company from one plan to another in a single call,
-- while keeping company_module_grants in sync with plan_module_access:
--   - For every module included in the new plan:
--       * insert an 'active' grant if none exists
--       * leave 'active' grants untouched
--       * NEVER touch 'revoked' grants (manual revocations are sticky)
--   - Modules that were 'active' due to the OLD plan but are NOT in the
--     new plan are left as 'active' (they become addon-like extras). The
--     superadmin can explicitly revoke them via admin_set_company_module_grant
--     if desired.

-- ─── 0. Drop any pre-existing signatures ───────────────────────────────────
-- change_company_plan may already exist from a prior partial run (the
-- function identity key is (name, arg types), so even renaming p_new_tier
-- → p_plan_id wouldn't let us redefine). Drop first, then recreate.
DROP FUNCTION IF EXISTS public.change_company_plan(uuid, text);
DROP FUNCTION IF EXISTS public.sync_plan_grants_for_company(uuid, text);

-- ─── 1. Helper: sync company_module_grants with the new plan's modules ──────
CREATE OR REPLACE FUNCTION public.sync_plan_grants_for_company(
  p_company_id uuid,
  p_new_tier   text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- For every module the new plan includes:
  --   - If there's no grant for this company+module → insert 'active'
  --   - If there's an 'active' grant → leave it (no-op)
  --   - If there's a 'revoked' grant → leave it (manual revocations sticky)
  INSERT INTO public.company_module_grants
    (company_id, module_key, status, granted_by, created_at, updated_at)
  SELECT
    p_company_id,
    pma.module_key,
    'active',
    NULL,                       -- granted_by: this is a system-driven grant
    now(),
    now()
  FROM public.plan_module_access pma
  WHERE pma.plan_id = p_new_tier
  ON CONFLICT (company_id, module_key) DO NOTHING;
END;
$function$;

-- ─── 2. change_company_plan RPC ────────────────────────────────────────────
-- Super_admin only. Atomically updates the company's plan and syncs the
-- company_module_grants table so the new plan's modules are granted.
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
  v_role       text;
  v_old_tier   text;
  v_plan_count integer;
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

  -- verify the company exists (so we don't silently update 0 rows)
  SELECT subscription_tier INTO v_old_tier
  FROM public.companies
  WHERE id = p_company_id;
  IF v_old_tier IS NULL THEN
    RAISE EXCEPTION 'company_not_found: %', p_company_id
      USING ERRCODE = 'P0002';
  END IF;

  -- validate the tier exists in plans (FK also enforces this, but a clean
  -- 22023 here is friendlier than a generic FK violation 23503)
  SELECT count(*) INTO v_plan_count
  FROM public.plans
  WHERE id = p_new_tier;
  IF v_plan_count = 0 THEN
    RAISE EXCEPTION 'invalid_tier: % is not a known plan', p_new_tier
      USING ERRCODE = '22023';
  END IF;

  -- update the company's tier (FK enforces that p_new_tier exists in plans)
  UPDATE public.companies
  SET subscription_tier = p_new_tier,
      updated_at = now()
  WHERE id = p_company_id;

  -- sync grants: add modules from the new plan that aren't already active,
  -- respecting manual revocations (those grants are NOT overwritten).
  PERFORM public.sync_plan_grants_for_company(p_company_id, p_new_tier);
END;
$function$;

-- ─── 3. Grants ──────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.change_company_plan(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
