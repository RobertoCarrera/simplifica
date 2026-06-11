-- ============================================
-- Migration: add_professional_is_public
-- Date: 2026-06-11
-- Description:
--   Add is_public column to professionals table to distinguish between
--   active (internally) and publicly visible (client-facing) professionals.
--
--   - is_public = true: professional appears in client-facing agenda/bookings
--   - is_active = false: professional is deactivated (no internal access)
--
-- Backfill: existing active professionals get is_public = true
--           (they were already visible, maintain backwards compatibility)
--
-- Index: for agenda queries filtering by is_public
--
-- Trigger: auto-set is_public = false when is_active becomes false
--          (unless is_public was explicitly set in the same UPDATE)
-- ============================================

-- 1. Add is_public column
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- 2. Backfill: existing active professionals get is_public = true
UPDATE professionals
  SET is_public = true
  WHERE is_active = true;

-- 3. Create index for agenda queries
CREATE INDEX IF NOT EXISTS idx_professionals_is_public
  ON professionals(company_id, is_public)
  WHERE is_public = true;

-- 4. Create trigger function to auto-set is_public = false when is_active becomes false
CREATE OR REPLACE FUNCTION professional_auto_unpublish()
RETURNS TRIGGER AS $$
BEGIN
  -- If is_active was true and now is false, AND is_public was not explicitly set
  -- (i.e., NEW.is_public = OLD.is_public, meaning it wasn't touched in this UPDATE)
  -- then set is_public = false
  IF OLD.is_active = true
     AND NEW.is_active = false
     AND NEW.is_public IS NOT DISTINCT FROM OLD.is_public THEN
    NEW.is_public := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger
DROP TRIGGER IF EXISTS trg_professional_auto_unpublish ON professionals;
CREATE TRIGGER trg_professional_auto_unpublish
  BEFORE UPDATE ON professionals
  FOR EACH ROW
  EXECUTE FUNCTION professional_auto_unpublish();