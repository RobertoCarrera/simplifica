-- ============================================================
-- CLEANUP: Drop truly unused columns
-- Date: 2026-03-19
-- Only columns with ZERO references in frontend code AND
-- no usage in SQL triggers, functions, or views.
-- ============================================================

-- tickets: SLA/metrics columns never populated or queried
-- (only exist in initial schema + auto-generated types)
ALTER TABLE IF EXISTS public.tickets
  DROP COLUMN IF EXISTS ticket_month,
  DROP COLUMN IF EXISTS closed_at,
  DROP COLUMN IF EXISTS first_response_at,
  DROP COLUMN IF EXISTS resolution_time_mins,
  DROP COLUMN IF EXISTS sla_status;

-- companies: google_calendar_display_config never used
-- (only exists in auto-generated types, no queries reference it)
ALTER TABLE IF EXISTS public.companies
  DROP COLUMN IF EXISTS google_calendar_display_config;
