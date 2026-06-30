-- ============================================
-- Migration: Module exclusivity in plan_addons (F-ADDON-007)
-- PR 4.6 / plans-pricing-freemium.
--
-- Business rule: a module can be assigned to at most one ACTIVE add-on.
-- This prevents duplicate module grants and forces super_admin to make
-- explicit reassignment decisions (remove from the owning add-on first,
-- or deactivate the owning add-on to free up the module).
--
-- Server enforcement lives inside admin_upsert_addon: if the submitted
-- p_included_modules overlaps with another active add-on's array, the
-- RPC raises SQLSTATE 23514 (check_violation) carrying the conflict
-- module name and the owning add-on name. Client surfaces a Spanish toast.
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_upsert_addon(
  p_id              text,
  p_name            text,
  p_description     text,
  p_icon            text,
  p_price_cents     integer,
  p_currency        text,
  p_billing_period  text,
  p_applies_to_plans text[],
  p_sort_order      integer,
  p_is_active       boolean,
  p_included_modules text[] DEFAULT '{}'
)
RETURNS public.plan_addons
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_name text;
  v_conflict_addon_id text;
  v_conflict_addon_name text;
  v_conflict_module text;
BEGIN
  -- (1) super_admin guard
  SELECT r.name INTO v_role_name
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();

  IF v_role_name IS NULL OR v_role_name != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required'
      USING ERRCODE = '42501';
  END IF;

  -- (2) F-ADDON-007 module exclusivity check.
  -- A module can belong to at most one ACTIVE add-on. We use the &&
  -- overlap operator on text[] to detect any common element in O(1) index
  -- lookup (Postgres GIN on the column would speed this further, omitted
  -- here to keep the migration lean).
  IF p_included_modules IS NOT NULL AND array_length(p_included_modules, 1) > 0 THEN
    SELECT a.id, a.name,
           (SELECT k
              FROM unnest(a.included_modules) AS k
             WHERE k = ANY(p_included_modules)
             LIMIT 1)
      INTO v_conflict_addon_id, v_conflict_addon_name, v_conflict_module
      FROM public.plan_addons a
     WHERE a.id <> p_id
       AND a.is_active = true
       AND a.included_modules && p_included_modules
     LIMIT 1;

    IF v_conflict_addon_id IS NOT NULL THEN
      RAISE EXCEPTION 'El módulo "%" ya está incluido en el add-on "%". Desactívalo o quítalo de allí antes de poder reasignarlo.',
        v_conflict_module, v_conflict_addon_name
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- (3) INSERT/UPSERT
  INSERT INTO public.plan_addons (
    id, name, description, icon, price_cents, currency, billing_period,
    applies_to_plans, sort_order, is_active, included_modules, updated_at
  ) VALUES (
    p_id, p_name, p_description, p_icon, p_price_cents, p_currency, p_billing_period,
    p_applies_to_plans, p_sort_order, p_is_active, COALESCE(p_included_modules, '{}'), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name             = EXCLUDED.name,
    description      = EXCLUDED.description,
    icon             = EXCLUDED.icon,
    price_cents      = EXCLUDED.price_cents,
    currency         = EXCLUDED.currency,
    billing_period   = EXCLUDED.billing_period,
    applies_to_plans = EXCLUDED.applies_to_plans,
    sort_order       = EXCLUDED.sort_order,
    is_active        = EXCLUDED.is_active,
    included_modules = EXCLUDED.included_modules,
    updated_at       = now();

  RETURN (SELECT a FROM public.plan_addons a WHERE a.id = p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_addon(
  p_id text, p_name text, p_description text, p_icon text,
  p_price_cents integer, p_currency text, p_billing_period text,
  p_applies_to_plans text[], p_sort_order integer, p_is_active boolean,
  p_included_modules text[]
) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;