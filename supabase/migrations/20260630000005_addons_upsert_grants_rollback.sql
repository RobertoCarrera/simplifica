-- Rollback for 20260630000005_addons_upsert_grants.sql
-- Restores the original admin_upsert_addon body (from 20260606000000) and
-- revokes EXECUTE again. Used only for emergency rollback — production
-- should never need this because the migration is purely additive on the
-- client side.

BEGIN;

-- Restore the original guard (RAISE EXCEPTION 'Permission denied: ...').
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
  p_is_active       boolean
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
    RAISE EXCEPTION 'Permission denied: super_admin required';
  END IF;

  INSERT INTO public.plan_addons (
    id, name, description, icon, price_cents, currency, billing_period,
    applies_to_plans, sort_order, is_active, updated_at
  ) VALUES (
    p_id, p_name, p_description, p_icon, p_price_cents, p_currency, p_billing_period,
    p_applies_to_plans, p_sort_order, p_is_active, now()
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
    updated_at       = now();

  RETURN (SELECT a FROM public.plan_addons a WHERE a.id = p_id);
END;
$$;

-- Revoke EXECUTE again (back to the 20260620 revoke state).
REVOKE EXECUTE ON FUNCTION public.admin_upsert_addon(
  p_id text, p_name text, p_description text, p_icon text,
  p_price_cents integer, p_currency text, p_billing_period text,
  p_applies_to_plans text[], p_sort_order integer, p_is_active boolean
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_upsert_addon(
  p_id text, p_name text, p_description text, p_icon text,
  p_price_cents integer, p_currency text, p_billing_period text,
  p_applies_to_plans text[], p_sort_order integer, p_is_active boolean
) FROM authenticated;

-- Re-grant so the function remains callable by other roles that depend on it.
GRANT EXECUTE ON FUNCTION public.admin_upsert_addon(
  p_id text, p_name text, p_description text, p_icon text,
  p_price_cents integer, p_currency text, p_billing_period text,
  p_applies_to_plans text[], p_sort_order integer, p_is_active boolean
) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;