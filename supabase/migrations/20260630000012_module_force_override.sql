-- ============================================
-- Migration: Fix array_agg empty arrays + add force-override for
-- admin_set_company_module (F-PB-006 override)
-- PR 4.7.4 / plans-pricing-freemium.
--
-- Two related changes:
--
-- (1) FIX bug: the previous plan-check in admin_set_company_module used
--     `array_agg(DISTINCT a.included_modules)` on the active-add-on
--     result. When there are no matching add-ons (the common case for
--     a company without add-ons yet), `array_agg` over the empty set
--     with DISTINCT comparison of text[] arrays raises:
--
--         ERROR: 2202E cannot accumulate empty arrays
--
--     Fix: use unnest first, then array_agg on the scalar module_key.
--
-- (2) Add force-override path. The previous F-PB-006 strict check
--     rejected activations of modules not in the plan. The super_admin
--     has asked for the ability to grant modules freely (or as
--     courtesy / promo / comp), so we now support a p_force boolean
--     flag. When p_force = true:
--       - The plan-membership check is skipped.
--       - The override is logged in company_module_overrides so we
--         have an audit trail (who, what, when, why).
--     Setting to inactive or activating in-plan modules is unaffected.
-- ============================================

BEGIN;

-- Audit table for forced module activations.
CREATE TABLE IF NOT EXISTS public.company_module_overrides (
  id              bigserial PRIMARY KEY,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_key      text NOT NULL,
  status          text NOT NULL CHECK (status IN ('active','inactive')),
  changed_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_module_overrides_company_idx
  ON public.company_module_overrides (company_id);
CREATE INDEX IF NOT EXISTS company_module_overrides_created_at_idx
  ON public.company_module_overrides (created_at DESC);

ALTER TABLE public.company_module_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_module_overrides_select ON public.company_module_overrides;
CREATE POLICY company_module_overrides_select ON public.company_module_overrides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      JOIN public.app_roles r ON u.app_role_id = r.id
       WHERE u.auth_user_id = auth.uid()
         AND r.name = 'super_admin'
    )
  );

CREATE OR REPLACE FUNCTION public.admin_set_company_module(
  p_target_company_id uuid,
  p_module_key        text,
  p_status            text,
  p_force             boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_user_role_name text;
  v_user_company_id uuid;
  v_user_id uuid;
  v_effective_modules text[];
  v_p_included text[];
  v_addons_included text[];
  v_in_plan boolean := false;
BEGIN
  -- Permission check: super_admin OR owner of the target company.
  SELECT u.id, r.name, u.company_id
    INTO v_user_id, v_user_role_name, v_user_company_id
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();

  IF v_user_role_name = 'super_admin' THEN
    -- Allowed
  ELSIF v_user_role_name = 'owner' AND v_user_company_id = p_target_company_id THEN
    -- Allowed (but force override only allowed for super_admin)
    IF p_force THEN
      RAISE EXCEPTION 'Only super_admin can force-override plan boundaries'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Access Denied: Insufficient permissions to set company module';
  END IF;

  -- F-PB-006: if activating and not forcing, verify the module is in
  -- the company's effective set (plan + active add-ons).
  IF p_status = 'active' AND NOT p_force THEN
    -- Plan modules
    SELECT p.included_modules INTO v_p_included
      FROM public.companies c
      LEFT JOIN public.plans p
        ON p.id = c.subscription_tier
       AND p.is_active = true
     WHERE c.id = p_target_company_id;

    -- Active add-on modules (fix: unnest to scalar rows first, then
    -- array_agg DISTINCT on scalars — avoids 'cannot accumulate
    -- empty arrays' when there are no add-on rows).
    SELECT COALESCE(array_agg(DISTINCT m.module_key), ARRAY[]::text[])
      INTO v_addons_included
      FROM public.plan_addons a
      JOIN public.company_plan_subscriptions cps
        ON cps.company_id = p_target_company_id
       AND cps.status = 'active'
       AND (a.applies_to_plans = ARRAY[]::text[]
            OR cps.plan_id = ANY(a.applies_to_plans))
       AND a.is_active = true,
      LATERAL unnest(a.included_modules) AS m(module_key)
     WHERE array_length(a.included_modules, 1) > 0;

    v_effective_modules :=
      COALESCE(v_p_included, ARRAY[]::text[])
        || COALESCE(v_addons_included, ARRAY[]::text[]);

    IF v_effective_modules IS NOT NULL AND
       NOT (p_module_key = ANY(v_effective_modules)) THEN
      RAISE EXCEPTION
        'Module "%" is not part of the company''s current plan. Change the plan, assign an add-on, or use force override.',
        p_module_key
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Upsert company module status
  INSERT INTO public.company_modules (company_id, module_key, status, updated_at)
  VALUES (p_target_company_id, p_module_key, p_status, now())
  ON CONFLICT (company_id, module_key)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now();

  -- Audit the override
  IF p_force THEN
    INSERT INTO public.company_module_overrides
      (company_id, module_key, status, changed_by, reason)
    VALUES
      (p_target_company_id, p_module_key, p_status, v_user_id,
       'super_admin force-override');
  END IF;

  RETURN jsonb_build_object('success', true, 'forced', p_force);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_set_company_module(uuid, text, text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;