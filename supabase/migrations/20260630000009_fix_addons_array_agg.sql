-- ============================================
-- Migration: Fix array_agg empty-arrays error in plan-assignment RPCs
-- PR 4.7.1 / plans-pricing-freemium.
--
-- Migration 0008 used `array_agg(DISTINCT a.included_modules)` to
-- collect add-on module keys. When either no addons match the plan OR
-- some matching addons have an empty included_modules array, Postgres
-- raises `cannot accumulate empty arrays` at runtime (admin UI
-- surfaces a 400 Bad Request with that exact error in the console).
--
-- Fix: unnest the included_modules array first (per-row module_key
-- text) before DISTINCT/array_agg. This sidesteps the text[]-vs-text[]
-- DISTINCT comparison that triggers the error, and also handles the
-- zero-row case naturally (array_agg returns NULL -> COALESCE -> '{}').
--
-- Also adds `WHERE array_length(a.included_modules, 1) > 0` so addons
-- with no modules are skipped entirely (they contribute nothing anyway).
-- ============================================

BEGIN;

-- (1) Fix change_company_plan.
CREATE OR REPLACE FUNCTION public.change_company_plan(
  p_company_id uuid,
  p_plan_id    text
) RETURNS public.company_plan_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid;
  v_role_name   text;
  v_sub         public.company_plan_subscriptions;
  v_plan_modules text[];
  v_addon_modules text[];
BEGIN
  SELECT u.id, r.name
    INTO v_user_id, v_role_name
  FROM public.users u
  LEFT JOIN public.app_roles r ON r.id = u.app_role_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Permission denied: user not found';
  END IF;

  IF v_role_name IS DISTINCT FROM 'super_admin' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.company_members cm
      JOIN public.app_roles r ON r.id = cm.role_id
      WHERE cm.user_id = v_user_id
        AND cm.company_id = p_company_id
        AND cm.status = 'active'
        AND r.name = 'owner'
    ) THEN
      RAISE EXCEPTION 'Permission denied: must be owner of the company or super_admin';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id AND is_active = true) THEN
    RAISE EXCEPTION 'Plan % not found or inactive', p_plan_id;
  END IF;

  UPDATE public.company_plan_subscriptions
     SET status = 'cancelled', ended_at = now(), updated_at = now()
   WHERE company_id = p_company_id
     AND status = 'active';

  INSERT INTO public.company_plan_subscriptions
    (company_id, plan_id, status, assigned_by)
  VALUES
    (p_company_id, p_plan_id, 'active', v_user_id)
  RETURNING * INTO v_sub;

  UPDATE public.companies
     SET subscription_tier = p_plan_id, updated_at = now()
   WHERE id = p_company_id;

  PERFORM public.sync_company_max_users(p_company_id);

  -- F-PB-006: sync company_modules to the new plan + add-ons.
  --   Unnest each addon's included_modules to rows of text (module_key)
  --   before array_agg so DISTINCT compares scalar values, not text[].
  --   Skips addons with empty included_modules (they'd contribute
  --   nothing anyway).
  SELECT included_modules INTO v_plan_modules
    FROM public.plans WHERE id = p_plan_id;
  SELECT COALESCE(array_agg(DISTINCT m.module_key), ARRAY[]::text[])
    INTO v_addon_modules
    FROM public.plan_addons a,
         LATERAL unnest(a.included_modules) AS m(module_key)
   WHERE a.is_active = true
     AND array_length(a.included_modules, 1) > 0
     AND (a.applies_to_plans = ARRAY[]::text[]
          OR p_plan_id = ANY(a.applies_to_plans));
  PERFORM public.sync_company_modules_to_plan(
    p_company_id,
    COALESCE(v_plan_modules, ARRAY[]::text[]) || COALESCE(v_addon_modules, ARRAY[]::text[])
  );

  RETURN v_sub;
END;
$$;

-- (2) Fix admin_assign_company_plan.
CREATE OR REPLACE FUNCTION public.admin_assign_company_plan(
  p_company_id uuid,
  p_plan_id    text,
  p_notes      text DEFAULT NULL
) RETURNS public.company_plan_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_role_name text;
  v_sub       public.company_plan_subscriptions;
  v_plan_modules text[];
  v_addon_modules text[];
BEGIN
  SELECT u.id, r.name
    INTO v_user_id, v_role_name
  FROM public.users u
  LEFT JOIN public.app_roles r ON r.id = u.app_role_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_role_name IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Permission denied: super_admin required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id AND is_active = true) THEN
    RAISE EXCEPTION 'Plan % not found or inactive', p_plan_id;
  END IF;

  UPDATE public.company_plan_subscriptions
     SET status = 'cancelled', ended_at = now(), updated_at = now()
   WHERE company_id = p_company_id
     AND status = 'active';

  INSERT INTO public.company_plan_subscriptions
    (company_id, plan_id, status, assigned_by, notes)
  VALUES
    (p_company_id, p_plan_id, 'active', v_user_id, p_notes)
  RETURNING * INTO v_sub;

  UPDATE public.companies
     SET subscription_tier = p_plan_id, updated_at = now()
   WHERE id = p_company_id;

  PERFORM public.sync_company_max_users(p_company_id);

  SELECT included_modules INTO v_plan_modules
    FROM public.plans WHERE id = p_plan_id;
  SELECT COALESCE(array_agg(DISTINCT m.module_key), ARRAY[]::text[])
    INTO v_addon_modules
    FROM public.plan_addons a,
         LATERAL unnest(a.included_modules) AS m(module_key)
   WHERE a.is_active = true
     AND array_length(a.included_modules, 1) > 0
     AND (a.applies_to_plans = ARRAY[]::text[]
          OR p_plan_id = ANY(a.applies_to_plans));
  PERFORM public.sync_company_modules_to_plan(
    p_company_id,
    COALESCE(v_plan_modules, ARRAY[]::text[]) || COALESCE(v_addon_modules, ARRAY[]::text[])
  );

  RETURN v_sub;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_company_plan(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_company_plan(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;