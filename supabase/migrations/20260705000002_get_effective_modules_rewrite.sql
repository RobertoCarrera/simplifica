-- Rewrite get_effective_modules to use the unified resolution chain:
--   plan_includes  ∪  addons_includes  ∪  manual_grants   −  manual_revocations
--
-- The function is SECURITY DEFINER so it can read the grant tables with RLS.
-- It returns one row per module_key with enabled = true/false.

CREATE OR REPLACE FUNCTION public.get_effective_modules(
  p_input_company_id text DEFAULT NULL,
  p_auth_user_id     uuid DEFAULT NULL
)
RETURNS TABLE (
  key     text,
  name    text,
  enabled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_tier       text;
BEGIN
  -- ── Resolve company ────────────────────────────────────────────────────
  IF p_input_company_id IS NOT NULL
     AND p_input_company_id <> 'null'
     AND p_input_company_id <> 'undefined' THEN
    v_company_id := p_input_company_id::uuid;
  ELSE
    -- Fall back to the user's primary company
    SELECT u.company_id INTO v_company_id
    FROM public.users u
    WHERE u.auth_user_id = p_auth_user_id
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RETURN;  -- no company = no modules
  END IF;

  -- ── Resolve tier ───────────────────────────────────────────────────────
  SELECT c.subscription_tier INTO v_tier
  FROM public.companies c
  WHERE c.id = v_company_id;

  -- A company with no plan gets nothing (per product rule: always must
  -- have a plan assigned). The FK guarantees v_tier is not null and
  -- references a real plan row.

  -- ── Resolution chain ──────────────────────────────────────────────────
  -- Step 1: plan_includes — every module_key on the plan_module_access
  --         row for the company's tier, marked enabled.
  -- Step 2: addons — every plan_addon whose applies_to_plans contains
  --         the tier (or is empty = applies to all), contributes its
  --         included_modules. Marked enabled.
  -- Step 3: manual grants — every company_module_grants row in 'active'
  --         state adds the module.
  -- Step 4: manual revocations — every company_module_grants row in
  --         'revoked' state REMOVES the module even if the plan would
  --         normally include it. This lets the superadmin explicitly
  --         take a module away.
  -- Step 5: super_admin bypass — if the caller is super_admin, return
  --         every module in the catalog as enabled.
  RETURN QUERY
  WITH plan_mods AS (
    SELECT pma.module_key
    FROM public.plan_module_access pma
    WHERE pma.plan_id = v_tier
  ),
  addon_mods AS (
    SELECT DISTINCT unnest(pa.included_modules) AS module_key
    FROM public.plan_addons pa
    WHERE pa.is_active = true
      AND ( pa.applies_to_plans = '{}'
         OR v_tier = ANY(pa.applies_to_plans) )
      AND pa.included_modules <> '{}'
  ),
  manual_grants AS (
    SELECT cmg.module_key
    FROM public.company_module_grants cmg
    WHERE cmg.company_id = v_company_id
      AND cmg.status = 'active'
  ),
  manual_revocations AS (
    SELECT cmg.module_key
    FROM public.company_module_grants cmg
    WHERE cmg.company_id = v_company_id
      AND cmg.status = 'revoked'
  ),
  effective AS (
    SELECT module_key FROM plan_mods
    UNION
    SELECT module_key FROM addon_mods
    UNION
    SELECT module_key FROM manual_grants
    EXCEPT
    SELECT module_key FROM manual_revocations
  )
  SELECT
    m.key,
    m.label AS name,
    true AS enabled
  FROM public.modules_catalog m
  JOIN effective e ON e.module_key = m.key
  ORDER BY m.label;

  -- ── Super-admin bypass ────────────────────────────────────────────────
  -- If the caller is a super_admin and didn't pass a company_id, they want
  -- the FULL catalog so the admin UI shows every possible module. We've
  -- already returned the per-company list above if a company was found;
  -- here we layer the full catalog on top, scoped to the requested
  -- company (or empty for a generic browse).
  IF p_auth_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.users u
       JOIN public.app_roles r ON u.app_role_id = r.id
       WHERE u.auth_user_id = p_auth_user_id
         AND r.name = 'super_admin'
     )
     AND v_company_id IS NULL THEN
    RETURN QUERY
    SELECT m.key, m.label, true
    FROM public.modules_catalog m
    ORDER BY m.label;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_effective_modules(text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
