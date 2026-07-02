-- ============================================
-- Migration: Add included_modules to plan_addons
-- PR 4.5 / plans-pricing-freemium (Add-on module binding).
--
-- Allows a super_admin to associate existing modules with an add-on so
-- the add-on "unlocks" those modules for any plan it's assigned to.
-- e.g. add-on "Verifactu extra" unlocks moduloFacturas for Pro / Business.
--
-- Empty array = the add-on does not grant any module access (current
-- behaviour, no breaking change). Rendered plans card will list the
-- union of plan.included_modules ∪ add-on.included_modules for every
-- add-on assigned to the plan.
-- ============================================

BEGIN;

ALTER TABLE public.plan_addons
  ADD COLUMN IF NOT EXISTS included_modules text[] NOT NULL DEFAULT '{}';

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
BEGIN
  SELECT r.name INTO v_role_name
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();

  IF v_role_name IS NULL OR v_role_name != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required'
      USING ERRCODE = '42501';
  END IF;

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