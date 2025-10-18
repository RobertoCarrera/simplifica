-- Migration: Drop position column from service_units
-- Created: 2025-10-18

BEGIN;

-- Safety: ensure column exists before dropping
ALTER TABLE service_units
DROP COLUMN IF EXISTS position;

COMMIT;

-- Down migration (re-create column as nullable integer, without restoring values)
-- Run this only if you need to roll back. It creates the column but does not repopulate the original ordering.
-- BEGIN;
-- ALTER TABLE service_units
-- ADD COLUMN IF NOT EXISTS position integer;
-- COMMIT;
