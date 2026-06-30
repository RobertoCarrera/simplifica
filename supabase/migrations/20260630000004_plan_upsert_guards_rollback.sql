-- ============================================
-- Rollback for migration 20260630000004_plan_upsert_guards.sql
-- Phase 2 / PR 2 of plans-pricing-freemium.
--
-- Restores admin_upsert_plan to its pre-PR-2 body (the original from
-- migration 20260606000000_create_plans.sql lines 105-160). Drops the
-- three guards added by 0004:
--
--   - SQLSTATE 42501 typed error → plain text "Permission denied"
--   - canonical-key guard       → accepts any payload
--   - is_highlighted mutex      → direct UPSERT (no sibling update)
--
-- Does NOT change any persisted is_highlighted values, so a company
-- left with two plans highlighted at the time of rollback stays that
-- way until a super_admin fixes it manually via SQL or the next
-- admin_upsert_plan call.
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_upsert_plan(
  p_id              text,
  p_name            text,
  p_tagline         text,
  p_description     text,
  p_base_price_cents integer,
  p_currency        text,
  p_billing_period  text,
  p_included_users  integer,
  p_extra_user_cents integer,
  p_included_modules text[],
  p_sort_order      integer,
  p_is_active       boolean,
  p_is_highlighted  boolean
)
RETURNS public.plans
LANGUAGE plpgsql
SECURITY DEFINER
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

  INSERT INTO public.plans (
    id, name, tagline, description, base_price_cents, currency, billing_period,
    included_users, extra_user_cents, included_modules, sort_order, is_active, is_highlighted, updated_at
  ) VALUES (
    p_id, p_name, p_tagline, p_description, p_base_price_cents, p_currency, p_billing_period,
    p_included_users, p_extra_user_cents, p_included_modules, p_sort_order, p_is_active, p_is_highlighted, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name             = EXCLUDED.name,
    tagline          = EXCLUDED.tagline,
    description      = EXCLUDED.description,
    base_price_cents = EXCLUDED.base_price_cents,
    currency         = EXCLUDED.currency,
    billing_period   = EXCLUDED.billing_period,
    included_users   = EXCLUDED.included_users,
    extra_user_cents = EXCLUDED.extra_user_cents,
    included_modules = EXCLUDED.included_modules,
    sort_order       = EXCLUDED.sort_order,
    is_active        = EXCLUDED.is_active,
    is_highlighted   = EXCLUDED.is_highlighted,
    updated_at       = now();

  RETURN (SELECT p FROM public.plans p WHERE p.id = p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_plan TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;