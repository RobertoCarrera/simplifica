-- ============================================
-- Migration: F-PB-008 (superadmin-only modules) + F-ADDON-002
-- (price_eur_cents rename + billing_period drop + delete support)
-- PR 4.8 / plans-pricing-freemium.
--
-- Five related changes:
--
-- 1. Mark Admin Webmail and Gestión Módulos as superadmin-only via a new
--    modules_catalog.superadmin_only boolean column. They are still
--    available as sidebar entries and as auto-on modules for every
--    company, but they no longer appear in the plan module picker
--    and cannot be toggled off. (Dashboard/core_/inicio is similar but
--    remains in the implicit-modules list with a read-only badge; these
--    two are NOT implicit — they are pure superadmin tools that
--    superadmin accesses through the sidebar regardless of the
--    company's plan.)
--
-- 2. Rename plan_addons.price_cents -> price_eur_cents to make the
--    unit explicit (cents of euros, i.e. integer * 1/100 = EUR). The
--    data is preserved (3000 stays 3000 = 30.00 EUR).
--
-- 3. Drop plan_addons.billing_period. Add-ons are always monthly for
--    now; the field added noise without value. The admin_upsert_addon
--    RPC stops accepting p_billing_period.
--
-- 4. New admin_delete_addon(p_id text) RPC. Hard-deletes an add-on.
--    Caller must be super_admin. Used by the new delete button in the
--    add-on editor form.
--
-- 5. admin_upsert_addon signature updated: p_billing_period removed,
--    p_price_cents renamed to p_price_eur_cents. All callers (the
--    PlanService wrapper in TS) updated accordingly.
-- ============================================

BEGIN;

-- (1) superadmin_only flag
ALTER TABLE public.modules_catalog
  ADD COLUMN IF NOT EXISTS superadmin_only boolean NOT NULL DEFAULT false;

UPDATE public.modules_catalog
   SET superadmin_only = true
 WHERE key IN ('core_/webmail-admin', 'core_/admin-modulos');

-- (3) drop billing_period (do this BEFORE the RPC rewrite so the new
-- function signature matches the new column layout)
ALTER TABLE public.plan_addons
  DROP COLUMN IF EXISTS billing_period;

-- (2) rename price_cents -> price_eur_cents
ALTER TABLE public.plan_addons
  RENAME COLUMN price_cents TO price_eur_cents;

-- (5) replace admin_upsert_addon with the new signature
CREATE OR REPLACE FUNCTION public.admin_upsert_addon(
  p_id               text,
  p_name             text,
  p_description     text,
  p_icon             text,
  p_price_eur_cents  integer,
  p_currency         text,
  p_applies_to_plans text[],
  p_sort_order       integer,
  p_is_active        boolean,
  p_included_modules text[] DEFAULT '{}'
) RETURNS public.plan_addons
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
    id, name, description, icon, price_eur_cents, currency,
    applies_to_plans, sort_order, is_active, included_modules, updated_at
  ) VALUES (
    p_id, p_name, p_description, p_icon, p_price_eur_cents, p_currency,
    p_applies_to_plans, p_sort_order, p_is_active,
    COALESCE(p_included_modules, '{}'), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name             = EXCLUDED.name,
    description      = EXCLUDED.description,
    icon             = EXCLUDED.icon,
    price_eur_cents  = EXCLUDED.price_eur_cents,
    currency         = EXCLUDED.currency,
    applies_to_plans = EXCLUDED.applies_to_plans,
    sort_order       = EXCLUDED.sort_order,
    is_active        = EXCLUDED.is_active,
    included_modules = EXCLUDED.included_modules,
    updated_at       = now();

  RETURN (SELECT a FROM public.plan_addons a WHERE a.id = p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_addon(
  text, text, text, text, integer, text, text[], integer, boolean, text[]
) TO authenticated;

-- (4) admin_delete_addon RPC
CREATE OR REPLACE FUNCTION public.admin_delete_addon(p_id text)
RETURNS void
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

  DELETE FROM public.plan_addons WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_addon(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;