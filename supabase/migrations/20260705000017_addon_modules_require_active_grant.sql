-- Fix: get_effective_modules was including plan_addons.included_modules
-- for every company on a plan that the addon applies to — even if the
-- company hadn't purchased or been gifted the addon.
--
-- That made every starter/pro/business company automatically get
-- moduloFacturas / moduloPresupuestos (the 'facturacion' addon's
-- included_modules) for free, regardless of any grant row.
--
-- Correct semantics: an addon's included_modules only kick in when the
-- company has an ACTIVE company_addon_grants row for that addon. The
-- addon's plan + price remain visible in the catalog, but the modules
-- don't auto-apply.
--
-- The new addons CTE restricts to module_keys that come from addons the
-- company has actually been granted (via purchase or superadmin gift).

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
    SELECT u.company_id INTO v_company_id
    FROM public.users u
    WHERE u.auth_user_id = p_auth_user_id
    LIMIT 1;
  END IF;

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  -- ── Resolve tier ───────────────────────────────────────────────────────
  SELECT c.subscription_tier INTO v_tier
  FROM public.companies c
  WHERE c.id = v_company_id;

  -- ── Resolution chain ──────────────────────────────────────────────────
  RETURN QUERY
  WITH plan_mods AS (
    SELECT pma.module_key
    FROM public.plan_module_access pma
    WHERE pma.plan_id = v_tier
  ),
  addon_mods AS (
    -- Addons' included_modules only count if the company has an ACTIVE
    -- grant for the addon (purchase or superadmin gift). A bare plan_addon
    -- row in the catalog is NOT enough — the addon has to be granted.
    SELECT DISTINCT unnest(pa.included_modules) AS module_key
    FROM public.plan_addons pa
    JOIN public.company_addon_grants cag
      ON cag.addon_id = pa.id
     AND cag.company_id = v_company_id
     AND cag.status = 'active'
    WHERE pa.is_active = true
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
