-- ============================================
-- Rollback: 20260630000002_insert_free_plan
--
-- Removes the `free` plan row. Idempotent: no-op if the row has
-- already been deleted or modified.
-- Spec ref: F-FREE-001 / F-PB-005.
-- ============================================

BEGIN;

DELETE FROM public.plans WHERE id = 'free';

NOTIFY pgrst, 'reload schema';
COMMIT;