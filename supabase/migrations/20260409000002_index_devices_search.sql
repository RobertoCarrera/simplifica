-- Migration: Add trigram indexes for devices ILIKE search
-- Problem: searchDevices() uses ILIKE on brand, model, serial_number, reported_issue
--          which causes full table scans without trigram indexes.
-- Solution: Enable pg_trgm and add GIN trigram indexes on searched columns.

-- 1. Enable pg_trgm extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. GIN trigram indexes for ILIKE search pattern:
--    query.or(`brand.ilike.%term%, model.ilike.%term%, serial_number.ilike.%term%, reported_issue.ilike.%term%`)

CREATE INDEX IF NOT EXISTS idx_devices_brand_trgm
  ON public.devices USING gin (brand gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_devices_model_trgm
  ON public.devices USING gin (model gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_devices_serial_number_trgm
  ON public.devices USING gin (serial_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_devices_reported_issue_trgm
  ON public.devices USING gin (reported_issue gin_trgm_ops);

-- 3. Refresh planner statistics
ANALYZE public.devices;
