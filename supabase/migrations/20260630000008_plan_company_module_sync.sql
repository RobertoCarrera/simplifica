-- ============================================
-- Migration: Plan-to-Company module sync + plan included_modules reset
-- PR 4.7 / plans-pricing-freemium.
--
-- Two related fixes bundled here:
--
-- (1) Restore the proper per-plan included_modules hierarchy. The
--     current data has all 4 plans (free/starter/pro/business) with
--     the same 7 modules due to drift in previous PRs. Resetting to
--     the documented hierarchy: free (3) < starter (5) < pro (8) <
--     business (14). Each higher plan strictly contains all the
--     previous plan's modules.
--
-- (2) Modify change_company_plan and admin_assign_company_plan so
--     that on every plan change the company's company_modules rows
--     are synchronised to the new plan's included_modules:
--       * Modules in the plan -> status='active' (inserted if absent)
--       * Modules NOT in the plan -> status='inactive' (row kept so
--         manual toggles survive a future plan upgrade)
--       * Add-ons assigned to the plan add their included_modules too
--         (addons.applies_to_plans contains the plan_id OR is empty
--         for universal add-ons)
--     The plan's included_modules wins on overlap.
--
-- Also tightens the change_company_plan super_admin guard: the owner
-- of the company is allowed to change their own company's plan, but
-- non-owner non-super_admin callers get 'Permission denied' (already
-- present, just verified).
-- ============================================

BEGIN;

-- (1) Restore the per-plan included_modules hierarchy.
UPDATE public.plans SET included_modules = ARRAY['core_/inicio', 'core_/clientes', 'core_/webmail']
  WHERE id = 'free';

UPDATE public.plans SET included_modules = ARRAY['core_/inicio', 'core_/clientes', 'core_/webmail', 'moduloReservas', 'moduloAnaliticas']
  WHERE id = 'starter';

UPDATE public.plans SET included_modules = ARRAY['core_/inicio', 'core_/clientes', 'core_/webmail', 'moduloReservas', 'moduloAnaliticas', 'moduloFacturas', 'moduloPresupuestos', 'core_/notifications']
  WHERE id = 'pro';

UPDATE public.plans SET included_modules = ARRAY['core_/inicio', 'core_/clientes', 'core_/webmail', 'moduloReservas', 'moduloAnaliticas', 'moduloFacturas', 'moduloPresupuestos', 'core_/notifications', 'documentacion', 'moduloProyectos', 'moduloProductos', 'moduloServicios', 'moduloSAT', 'moduloChat']
  WHERE id = 'business';

-- (2) Sync helper used by both plan-assignment RPCs.
--     Takes the company_id and a text[] of module keys (the plan's
--     included_modules + any add-on included_modules) and reconciles
--     company_modules to match.
CREATE OR REPLACE FUNCTION public.sync_company_modules_to_plan(
  p_company_id    uuid,
  p_plan_modules  text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective text[];
BEGIN
  -- Normalise: dedupe + null -> empty.
  SELECT COALESCE(array_agg(DISTINCT m), ARRAY[]::text[])
    INTO v_effective
    FROM unnest(COALESCE(p_plan_modules, ARRAY[]::text[])) AS m
   WHERE m IS NOT NULL AND length(m) > 0;

  -- Activate modules in the plan (insert if absent).
  INSERT INTO public.company_modules (company_id, module_key, status, updated_at)
    SELECT p_company_id, m, 'active', now()
      FROM unnest(v_effective) AS m
  ON CONFLICT (company_id, module_key) DO UPDATE
    SET status = 'active', updated_at = now();

  -- Deactivate modules NOT in the plan (only if currently active so
  -- we don't churn 'inactive' rows).
  IF array_length(v_effective, 1) IS NULL THEN
    -- Plan has no modules -> deactivate everything for this company.
    UPDATE public.company_modules
       SET status = 'inactive', updated_at = now()
     WHERE company_id = p_company_id
       AND status = 'active';
  ELSE
    UPDATE public.company_modules
       SET status = 'inactive', updated_at = now()
     WHERE company_id = p_company_id
       AND module_key <> ALL(v_effective)
       AND status = 'active';
  END IF;
END;
$$;

-- (3) Replace change_company_plan with the sync hook before RETURN.
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
  SELECT included_modules INTO v_plan_modules
    FROM public.plans WHERE id = p_plan_id;
  SELECT COALESCE(array_agg(DISTINCT a.included_modules), ARRAY[]::text[])
    INTO v_addon_modules
    FROM public.plan_addons a
   WHERE a.is_active = true
     AND (a.applies_to_plans = ARRAY[]::text[]
          OR p_plan_id = ANY(a.applies_to_plans));
  PERFORM public.sync_company_modules_to_plan(
    p_company_id,
    COALESCE(v_plan_modules, ARRAY[]::text[]) || COALESCE(v_addon_modules, ARRAY[]::text[])
  );

  RETURN v_sub;
END;
$$;

-- (4) Replace admin_assign_company_plan with the same sync hook.
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

  -- F-PB-006: same sync as the self-service path.
  SELECT included_modules INTO v_plan_modules
    FROM public.plans WHERE id = p_plan_id;
  SELECT COALESCE(array_agg(DISTINCT a.included_modules), ARRAY[]::text[])
    INTO v_addon_modules
    FROM public.plan_addons a
   WHERE a.is_active = true
     AND (a.applies_to_plans = ARRAY[]::text[]
          OR p_plan_id = ANY(a.applies_to_plans));
  PERFORM public.sync_company_modules_to_plan(
    p_company_id,
    COALESCE(v_plan_modules, ARRAY[]::text[]) || COALESCE(v_addon_modules, ARRAY[]::text[])
  );

  RETURN v_sub;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_company_modules_to_plan(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_company_plan(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_company_plan(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;