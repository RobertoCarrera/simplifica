-- Fix remaining RPCs that still reference the dropped 'company_modules' table.
-- Replace each with the equivalent query against 'company_module_grants'.
--
-- Functions patched:
--   1. company_has_module(p_company_id uuid, p_module_key text) → bool
--   2. check_public_company_module(p_slug text, p_module_key text) → bool
--   3. admin_set_company_module(p_company_id uuid, p_module_key text, p_status text, p_force boolean DEFAULT false) → void
--   4. admin_assign_company_plan(p_company_id uuid, p_plan_id text) → void
--   5. sync_company_modules_to_plan(p_company_id uuid) → void

-- Drop existing versions with their OLD signatures so CREATE OR REPLACE
-- doesn't trip on the return-type / argument-list mismatch.
DROP FUNCTION IF EXISTS public.check_public_company_module(uuid, text);
DROP FUNCTION IF EXISTS public.admin_set_company_module(uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_set_company_module(uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.admin_assign_company_plan(uuid, text, text);
DROP FUNCTION IF EXISTS public.sync_company_modules_to_plan(uuid, text[]);

-- ─── 1. company_has_module ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.company_has_module(
  p_company_id uuid,
  p_module_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  -- A module is 'enabled' for a company iff there is an active grant
  -- (manual override) OR the company's plan includes it via plan_module_access
  -- OR the matching add-on includes it via plan_addons.applies_to_plans.
  -- We collapse all three sources into a single boolean.
  SELECT status INTO v_status
    FROM public.company_module_grants
   WHERE company_id = p_company_id
     AND module_key = p_module_key
     AND status = 'active';
  IF FOUND THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.companies c
      JOIN public.plan_module_access pma ON pma.plan_id = c.subscription_tier
     WHERE c.id = p_company_id
       AND pma.module_key = p_module_key
  )
  OR EXISTS (
    SELECT 1
      FROM public.companies c
      JOIN public.plan_addons pa
        ON pa.is_active = true
       AND (pa.applies_to_plans = '{}' OR c.subscription_tier = ANY(pa.applies_to_plans))
       AND pa.included_modules <> '{}'
     WHERE c.id = p_company_id
       AND p_module_key = ANY(pa.included_modules)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.company_has_module(uuid, text) TO authenticated;

-- ─── 2. check_public_company_module (public, no auth needed) ─────────────
-- Same logic as company_has_module but resolves company from slug.
CREATE OR REPLACE FUNCTION public.check_public_company_module(
  p_slug text,
  p_module_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug = p_slug LIMIT 1;
  IF v_company_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.company_has_module(v_company_id, p_module_key);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.check_public_company_module(text, text) TO anon, authenticated;

-- ─── 3. admin_set_company_module ─────────────────────────────────────────
-- Toggles a module for a company. Replaces the old company_modules row
-- with a company_module_grants row. Honors the p_force parameter:
--   - p_force = true: override the plan (write 'active' even if plan doesn't include it)
--   - p_force = false: revoke (write 'revoked')
-- Mirrors the semantics of the old (active|revoked) status enum.
CREATE OR REPLACE FUNCTION public.admin_set_company_module(
  p_company_id uuid,
  p_module_key text,
  p_status text,
  p_force boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role_name text;
BEGIN
  -- Security: only super_admin can toggle.
  SELECT r.name INTO v_role_name
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role_name IS NULL OR v_role_name != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'invalid status: %', p_status USING ERRCODE = '22023';
  END IF;

  -- Map: 'active' = grant the module (active row in company_module_grants)
  --      'inactive' = revoke the module (revoked row in company_module_grants)
  -- Note: p_force is preserved for back-compat. In the new model, every
  -- override is explicit and the plan resolution handles the rest, so
  -- p_force is informational only.
  INSERT INTO public.company_module_grants
    (company_id, module_key, status, reason, granted_by, updated_at)
  VALUES
    (p_company_id, p_module_key,
     CASE WHEN p_status = 'active' THEN 'active' ELSE 'revoked' END,
     CASE WHEN p_force THEN 'manual override' ELSE 'manual revoke' END,
     (SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1),
     now())
  ON CONFLICT (company_id, module_key) DO UPDATE
    SET status = EXCLUDED.status,
        reason = EXCLUDED.reason,
        granted_by = EXCLUDED.granted_by,
        updated_at = now();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_set_company_module(uuid, text, text, boolean) TO authenticated;

-- ─── 4. admin_assign_company_plan ────────────────────────────────────────
-- Replaces the old version that wrote to company_modules.included_modules.
-- Now writes to company_module_grants and syncs max_users.
CREATE OR REPLACE FUNCTION public.admin_assign_company_plan(
  p_company_id uuid,
  p_plan_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role_name text;
  v_included_users int;
BEGIN
  -- Security: super_admin only.
  SELECT r.name INTO v_role_name
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();
  IF v_role_name IS NULL OR v_role_name != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required' USING ERRCODE = '42501';
  END IF;

  -- Validate plan exists.
  SELECT included_users INTO v_included_users FROM public.plans WHERE id = p_plan_id;
  IF v_included_users IS NULL THEN
    RAISE EXCEPTION 'plan not found: %', p_plan_id USING ERRCODE = '22023';
  END IF;

  -- Update the company's tier.
  UPDATE public.companies
     SET subscription_tier = p_plan_id,
         max_users = v_included_users,
         updated_at = now()
   WHERE id = p_company_id;

  -- Sync plan_module_access → company_module_grants for this company:
  --   - For each module in the plan: ensure an 'active' grant exists,
  --     unless the company has a 'revoked' grant (sticky revocations).
  INSERT INTO public.company_module_grants (company_id, module_key, status, updated_at)
  SELECT p_company_id, pma.module_key, 'active', now()
    FROM public.plan_module_access pma
   WHERE pma.plan_id = p_plan_id
     AND NOT EXISTS (
       SELECT 1 FROM public.company_module_grants cmg
        WHERE cmg.company_id = p_company_id
          AND cmg.module_key = pma.module_key
     );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_assign_company_plan(uuid, text) TO authenticated;

-- ─── 5. sync_company_modules_to_plan ─────────────────────────────────────
-- Replaces the company's grants with exactly what the plan dictates,
-- dropping any manual overrides unless p_preserve_overrides is true.
-- (Function signature kept the same; p_preserve_overrides defaults to true.)
CREATE OR REPLACE FUNCTION public.sync_company_modules_to_plan(
  p_company_id uuid,
  p_preserve_overrides boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text;
BEGIN
  SELECT subscription_tier INTO v_tier FROM public.companies WHERE id = p_company_id;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'company not found: %', p_company_id USING ERRCODE = 'P0002';
  END IF;

  IF p_preserve_overrides THEN
    -- Sticky revocations: keep 'revoked' grants, add missing plan modules
    -- as 'active', but never re-add modules that have been explicitly revoked.
    INSERT INTO public.company_module_grants (company_id, module_key, status, updated_at)
    SELECT p_company_id, pma.module_key, 'active', now()
      FROM public.plan_module_access pma
     WHERE pma.plan_id = v_tier
       AND NOT EXISTS (
         SELECT 1 FROM public.company_module_grants cmg
          WHERE cmg.company_id = p_company_id
            AND cmg.module_key = pma.module_key
       );
  ELSE
    -- Destructive: replace all grants with the plan's current set
    -- (manual revocations are also dropped — destructive path, hence
    -- the explicit opt-in via p_preserve_overrides = false).
    DELETE FROM public.company_module_grants WHERE company_id = p_company_id;
    INSERT INTO public.company_module_grants (company_id, module_key, status, updated_at)
    SELECT p_company_id, pma.module_key, 'active', now()
      FROM public.plan_module_access pma
     WHERE pma.plan_id = v_tier;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.sync_company_modules_to_plan(uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
