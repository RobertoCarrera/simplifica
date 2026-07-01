-- ============================================
-- Migration: Plan-gated company module status (F-PB-006 strict)
-- PR 4.7.3 / plans-pricing-freemium.
--
-- Tightens the existing admin_set_company_module RPC: setting a
-- module to 'active' is only allowed if the module is in the company's
-- effective set (plan.included_modules UNION all active add-ons for
-- that plan). Setting to 'inactive' is always allowed (the company
-- can opt out of a module they're paying for).
--
-- Business rule: a company's available modules are determined by
-- their plan + add-ons, not by the super_admin's whim. To give a
-- company a module they don't have, the super_admin must change
-- the plan or assign an add-on. This is enforced server-side so even
-- direct API calls cannot bypass the rule.
--
-- Also unifies the function definition with the rest of the project's
-- search_path conventions (added 'extensions').
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_set_company_module(
  p_target_company_id uuid,
  p_module_key        text,
  p_status            text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_user_role_name text;
  v_user_company_id uuid;
  v_effective_modules text[];
BEGIN
  -- Permission check: super_admin OR owner of the target company.
  SELECT r.name, u.company_id
    INTO v_user_role_name, v_user_company_id
    FROM public.users u
    JOIN public.app_roles r ON u.app_role_id = r.id
   WHERE u.auth_user_id = auth.uid();

  IF v_user_role_name = 'super_admin' THEN
    -- Allowed
  ELSIF v_user_role_name = 'owner' AND v_user_company_id = p_target_company_id THEN
    -- Allowed
  ELSE
    RAISE EXCEPTION 'Access Denied: Insufficient permissions to set company module';
  END IF;

  -- F-PB-006 strict: if activating, verify the module is in the
  -- company's effective set (plan + active add-ons). Deactivating
  -- is always allowed.
  IF p_status = 'active' THEN
    SELECT
      COALESCE(p.included_modules, ARRAY[]::text[])
        ||
      COALESCE((
        SELECT array_agg(DISTINCT a.included_modules)
          FROM public.plan_addons a
          JOIN public.company_plan_subscriptions cps
            ON cps.plan_id = ANY(a.applies_to_plans) OR array_length(a.applies_to_plans, 1) IS NULL
         WHERE cps.company_id = p_target_company_id
           AND cps.status = 'active'
           AND a.is_active = true
      ), ARRAY[]::text[])
      INTO v_effective_modules
      FROM public.companies c
      LEFT JOIN public.plans p
        ON p.id = c.subscription_tier
       AND p.is_active = true
     WHERE c.id = p_target_company_id;

    -- Defensive: if the company has no plan, the super_admin may
    -- still want to grant modules manually. Only enforce when there
    -- IS a plan.
    IF v_effective_modules IS NOT NULL AND
       NOT (p_module_key = ANY(v_effective_modules)) THEN
      RAISE EXCEPTION
        'Module "%" is not part of the company''s current plan. Change the plan or assign an add-on first.',
        p_module_key
      USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Upsert company module status
  INSERT INTO public.company_modules (company_id, module_key, status, updated_at)
  VALUES (p_target_company_id, p_module_key, p_status, now())
  ON CONFLICT (company_id, module_key)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_set_company_module(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;