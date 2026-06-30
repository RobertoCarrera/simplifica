-- ============================================
-- Rollback: 20260630000001_align_plans_module_keys
--
-- Restores `plans.included_modules` from the backup table captured by
-- the forward migration and drops the helper tables. Idempotent: safe
-- to re-run (no-ops if the backup or map has already been dropped).
-- ============================================

BEGIN;

DO $$
DECLARE r record;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name   = 'plans_included_modules_backup'
  ) THEN
    FOR r IN SELECT plan_id, included_modules
               FROM public.plans_included_modules_backup LOOP
      UPDATE public.plans
         SET included_modules = r.included_modules
       WHERE id = r.plan_id;
    END LOOP;
  END IF;
END $$;

DROP TABLE IF EXISTS public.plans_included_modules_backup;
DROP TABLE IF EXISTS public.module_key_canonical_map;

NOTIFY pgrst, 'reload schema';
COMMIT;