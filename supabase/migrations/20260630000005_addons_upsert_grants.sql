-- ============================================
-- Migration: Re-grant admin_upsert_addon + SQLSTATE 42501
-- PR 4 / plans-pricing-freemium (Add-ons Editor).
--
-- Background: migration 20260620_revoke_authenticated_standalone_secdef.sql
-- revoked EXECUTE on admin_upsert_addon FROM authenticated, leaving the
-- RPC unreachable from the Angular client even though it has a super_admin
-- guard internally. This migration re-grants EXECUTE and tightens the guard
-- to use SQLSTATE 42501 (matching the admin_upsert_plan pattern from PR 2
-- migration 0004) so the client can translate errors consistently.
--
-- A future migration can introduce admin_delete_addon if the UI needs it.
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
    -- SQLSTATE 42501 (insufficient_privilege) so the client can translate
    -- this to a Spanish toast via the same path as admin_upsert_plan
    -- (see F-PB-003 / F-PCA-003).
    RAISE EXCEPTION 'insufficient_privilege: super_admin required'
      USING ERRCODE = '42501';
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

-- Re-grant EXECUTE (was revoked by 20260620_revoke_authenticated_standalone_secdef.sql).
-- The function body still rejects non-super_admin via the SQLSTATE 42501 guard above.
GRANT EXECUTE ON FUNCTION public.admin_upsert_addon(
  p_id text, p_name text, p_description text, p_icon text,
  p_price_cents integer, p_currency text, p_billing_period text,
  p_applies_to_plans text[], p_sort_order integer, p_is_active boolean
) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;