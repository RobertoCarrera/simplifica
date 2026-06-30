-- ============================================
-- Migration: admin_upsert_plan guards (mutex + 42501 + canonical-key)
-- Phase 2 / PR 2 of plans-pricing-freemium.
--
-- Extends the existing admin_upsert_plan RPC with three guards
-- that are spec-mandated and would otherwise require a separate
-- function overload (rejected by ADR-01):
--
--   1. SQLSTATE 42501 — non-super_admin → typed insufficient_privilege
--      so the client can translate to "No tienes permisos de super_admin"
--      (F-PCA-003, F-PB-003).
--   2. SQLSTATE 22023 — included_modules contains keys NOT in the
--      canonical namespace (SIDEBAR_CATALOG UNION module_key_canonical_map.canonical_key).
--      Prevents legacy-key data from sneaking back into the catalog
--      (F-PB-004, F-PCA-004).
--   3. is_highlighted mutex — when p_is_highlighted=true, atomically
--      unset is_highlighted on every sibling plan in the same transaction
--      (ADR-06, F-PB-003, F-PCA-002). Uses the `plans_touch_updated_at`
--      trigger so updated_at is refreshed on the affected siblings.
--
-- The original positional parameter signature is preserved (ADR-01).
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
SET search_path = public
AS $$
DECLARE
  v_role_name  text;
  v_canonical_count int;
  v_input_count      int;
BEGIN
  -- (1) super_admin guard — SQLSTATE 42501 (typed, client-translatable).
  SELECT r.name INTO v_role_name
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();

  IF v_role_name IS NULL OR v_role_name != 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required'
      USING ERRCODE = '42501';
  END IF;

  -- (2) canonical-key guard — SQLSTATE 22023 (invalid_parameter_value).
  -- The canonical namespace is the UNION of:
  --   - public.module_key_canonical_map.canonical_key (server-side source of truth from 0001)
  --   - SIDEBAR_CATALOG keys that aren't in the legacy map (core_/inicio,
  --     core_/notifications, core_/gdpr, core_/webmail-admin,
  --     core_/admin/modulos, documentacion).
  -- A NULL p_included_modules is treated as "no modules" and bypasses the guard.
  IF p_included_modules IS NOT NULL THEN
    v_input_count := array_length(p_included_modules, 1);

    SELECT count(*) INTO v_canonical_count
      FROM unnest(p_included_modules) AS k
     WHERE k IN (SELECT canonical_key FROM public.module_key_canonical_map)
        OR k IN (
          'core_/inicio','core_/notifications','core_/gdpr',
          'core_/webmail-admin','core_/admin/modulos','documentacion'
        );

    IF v_canonical_count IS DISTINCT FROM v_input_count THEN
      RAISE EXCEPTION 'invalid_module_key: payload contains non-canonical module keys'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- (3) is_highlighted mutex — atomic transaction, sibling-first (ADR-06).
  -- Runs BEFORE the UPSERT so any caller reading the plans table after
  -- the RPC returns never sees two plans highlighted at once.
  IF p_is_highlighted = true THEN
    UPDATE public.plans
       SET is_highlighted = false
     WHERE id <> p_id AND is_highlighted = true;
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