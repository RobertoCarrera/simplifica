-- ================================================================
-- Rollup: Apply critical stage management migrations in order
-- Date: 2025-10-20
-- Purpose: Convenience file to run in SQL editor if CLI migrations are not used
--          Applies coverage fix + RPC creation + enum cast fix
-- ================================================================

BEGIN;

-- 1) Fix coverage function to count visible stages (company + generics not hidden)
\i 'supabase/migrations/20251020_fix_category_coverage_visibility.sql'

-- 2) Create initial safe_delete_ticket_stage in public schema
\i 'supabase/migrations/20251020_create_safe_delete_ticket_stage.sql'

-- 3) Overwrite with enum/text cast fixes for stage_category/workflow_category
\i 'supabase/migrations/20251020_fix_safe_delete_stage_casts.sql'

COMMIT;
