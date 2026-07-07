-- Tag plan-synced module grants so the frontend can distinguish them from
-- manual gifts. Without a 'reason' value, both kinds looked identical in
-- the admin UI and the gift count was inflated.
--
-- The sync_company_modules_to_plan RPC inserts rows on every plan change.
-- Going forward those rows will have reason='plan sync' so the frontend
-- can filter them out of the "regalos activos" count.
--
-- The legacy NULL-reason rows already in the DB are tagged too — they were
-- inserted by the previous version of sync_company_modules_to_plan, so
-- they ARE plan-synced.

CREATE OR REPLACE FUNCTION public.sync_company_modules_to_plan(
  p_company_id uuid,
  p_preserve_overrides boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text;
BEGIN
  SELECT subscription_tier INTO v_tier FROM public.companies WHERE id = p_company_id;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'company not found: %', p_company_id USING ERRCODE = 'P0002';
  END IF;

  IF p_preserve_overrides THEN
    INSERT INTO public.company_module_grants (company_id, module_key, status, reason, updated_at)
    SELECT p_company_id, pma.module_key, 'active', 'plan sync', now()
      FROM public.plan_module_access pma
     WHERE pma.plan_id = v_tier
       AND NOT EXISTS (
         SELECT 1 FROM public.company_module_grants cmg
          WHERE cmg.company_id = p_company_id
            AND cmg.module_key = pma.module_key
       );
  ELSE
    DELETE FROM public.company_module_grants WHERE company_id = p_company_id;
    INSERT INTO public.company_module_grants (company_id, module_key, status, reason, updated_at)
    SELECT p_company_id, pma.module_key, 'active', 'plan sync', now()
      FROM public.plan_module_access pma
     WHERE pma.plan_id = v_tier;
  END IF;
END;
$function$;

-- Backfill: every existing grant with reason IS NULL is plan-synced
-- (sync_company_modules_to_plan didn't set a reason before, so it
-- defaulted to NULL). Tag them so the frontend can exclude them.
UPDATE public.company_module_grants
SET reason = 'plan sync'
WHERE reason IS NULL;

NOTIFY pgrst, 'reload schema';
