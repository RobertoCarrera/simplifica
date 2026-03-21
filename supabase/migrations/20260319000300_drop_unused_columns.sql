-- ============================================================
-- CLEANUP: Drop truly unused columns
-- Date: 2026-03-19
-- Only columns with ZERO references in frontend code AND
-- no usage in SQL triggers, functions, or views.
-- ============================================================

-- tickets: SLA/metrics columns never populated or queried
-- (only exist in initial schema + auto-generated types)
-- Each column dropped separately to handle individual dependency conflicts
DO $$ BEGIN ALTER TABLE public.tickets DROP COLUMN IF EXISTS ticket_month;
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'ticket_month has dependent objects (analytics views), skipping';
END $$;
DO $$ BEGIN ALTER TABLE public.tickets DROP COLUMN IF EXISTS closed_at;
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'closed_at has dependent objects, skipping';
END $$;
DO $$ BEGIN ALTER TABLE public.tickets DROP COLUMN IF EXISTS first_response_at;
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'first_response_at has dependent objects, skipping';
END $$;
DO $$ BEGIN ALTER TABLE public.tickets DROP COLUMN IF EXISTS resolution_time_mins;
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'resolution_time_mins has dependent objects, skipping';
END $$;
DO $$ BEGIN ALTER TABLE public.tickets DROP COLUMN IF EXISTS sla_status;
EXCEPTION WHEN dependent_objects_still_exist THEN
  RAISE NOTICE 'sla_status has dependent objects, skipping';
END $$;

-- companies: google_calendar_display_config never used
-- (only exists in auto-generated types, no queries reference it)
ALTER TABLE IF EXISTS public.companies
  DROP COLUMN IF EXISTS google_calendar_display_config;
