-- admin_resync_company_to_plan RPC.
--
-- Brings a company's module grants back in sync with its CURRENT plan.
-- This is the "I changed the company's plan in the past and now the grants
-- table no longer reflects what they should have" fix-it tool.
--
-- ─── Two modes ─────────────────────────────────────────────────────────────
-- 1. p_remove_orphan_grants = false (default, "safe / sticky"):
--    Same behavior as the sync step inside change_company_plan:
--      - ADD any module from plan_module_access that the company doesn't
--        already have a grant for, as 'active'.
--      - Leave existing 'active' grants alone.
--      - Leave existing 'revoked' grants alone (manual revocations are sticky).
--    This is the right call for most "I moved them down a tier and now I
--    realize one of their old modules disappeared" situations where you
--    want to top up just what's missing.
--
-- 2. p_remove_orphan_grants = true (destructive, "prune to plan"):
--    After step 1, also DELETE every grant whose module_key is NOT in the
--    current plan. IMPORTANT: company_module_grants does NOT track whether
--    a grant was added by the plan or manually, so this will also delete
--    MANUALLY-granted modules that happen to be outside the current plan.
--    Use deliberately (e.g. via admin UI: "purge plan-only grants").
--
-- ─── Returns ───────────────────────────────────────────────────────────────
-- integer = (rows_added + rows_removed) for the call.
--
-- ─── Authorization ────────────────────────────────────────────────────────
-- super_admin only. Mirrors change_company_plan's gate.

-- ─── 0. Drop pre-existing signature, if any ──────────────────────────────
DROP FUNCTION IF EXISTS public.admin_resync_company_to_plan(uuid, boolean);

-- ─── 1. Function ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_resync_company_to_plan(
  p_company_id           uuid,
  p_remove_orphan_grants boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role         text;
  v_current_tier text;
  v_plan_count   integer;
  v_rows_added   integer := 0;
  v_rows_removed integer := 0;
BEGIN
  -- super_admin gate (same shape as change_company_plan)
  SELECT r.name INTO v_role
  FROM public.users u
  JOIN public.app_roles r ON u.app_role_id = r.id
  WHERE u.auth_user_id = auth.uid();
  IF v_role IS NULL OR v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'insufficient_privilege: super_admin required'
      USING ERRCODE = '42501';
  END IF;

  -- Load the company's CURRENT tier. We use this as the source of truth;
  -- the RPC does NOT change it (use change_company_plan for that).
  SELECT subscription_tier INTO v_current_tier
  FROM public.companies
  WHERE id = p_company_id;
  IF v_current_tier IS NULL THEN
    RAISE EXCEPTION 'company_not_found: %', p_company_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Defensive: the company's tier should always reference a row in plans,
  -- but protect against the plan having been deleted out from under us.
  SELECT count(*) INTO v_plan_count
  FROM public.plans
  WHERE id = v_current_tier;
  IF v_plan_count = 0 THEN
    RAISE EXCEPTION 'invalid_tier: company % is on missing plan %',
      p_company_id, v_current_tier
      USING ERRCODE = '22023';
  END IF;

  -- ─── Step 1: add missing plan grants ────────────────────────────────
  -- ON CONFLICT DO NOTHING means manual 'revoked' rows survive
  -- (PG ignores the insert because the (company_id, module_key) PK
  -- already exists). ROW_COUNT reports only the rows actually inserted.
  INSERT INTO public.company_module_grants
    (company_id, module_key, status, granted_by, created_at, updated_at)
  SELECT
    p_company_id,
    pma.module_key,
    'active',
    NULL,                       -- system-granted, not manual
    now(),
    now()
  FROM public.plan_module_access pma
  WHERE pma.plan_id = v_current_tier
  ON CONFLICT (company_id, module_key) DO NOTHING;
  GET DIAGNOSTICS v_rows_added = ROW_COUNT;

  -- ─── Step 2: optionally remove orphan grants ───────────────────────
  -- CAUTION: company_module_grants has no source column, so we can't
  -- tell plan-added grants from manual ones. Deleting by plan mismatch
  -- will remove ANY grant for a module the current plan doesn't include,
  -- manual or not. Documented at the top of this file.
  IF p_remove_orphan_grants THEN
    DELETE FROM public.company_module_grants cmg
    WHERE cmg.company_id = p_company_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.plan_module_access pma
        WHERE pma.plan_id = v_current_tier
          AND pma.module_key = cmg.module_key
      );
    GET DIAGNOSTICS v_rows_removed = ROW_COUNT;
  END IF;

  RETURN v_rows_added + v_rows_removed;
END;
$function$;

-- ─── 2. Grants ──────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.admin_resync_company_to_plan(uuid, boolean)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
