-- ─────────────────────────────────────────────────────────────
-- Fix: Prevent duplicate docplanner bookings (race condition)
-- ─────────────────────────────────────────────────────────────
-- The docplanner-sync-cron uses SELECT + INSERT without a UNIQUE
-- constraint, allowing concurrent runs to insert the same booking
-- twice. Each duplicate creates its own Google Calendar event.
--
-- This migration:
--   1. Removes duplicate bookings (keeps oldest, deletes newer)
--   2. Adds a UNIQUE constraint to prevent future duplicates
-- ─────────────────────────────────────────────────────────────

-- Step 1: Delete orphaned Google Calendar events will need manual
-- cleanup in GCal. Here we just remove the DB duplicates, keeping
-- the row that has a google_event_id (or the oldest if none do).

DELETE FROM public.bookings
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY company_id, docplanner_booking_id
        ORDER BY
          -- Prefer the row that already has a google_event_id
          CASE WHEN google_event_id IS NOT NULL THEN 0 ELSE 1 END,
          created_at ASC
      ) AS rn
    FROM public.bookings
    WHERE docplanner_booking_id IS NOT NULL
  ) dupes
  WHERE rn > 1
);

-- Step 2: Drop the old plain index (replaced by the unique constraint)
DROP INDEX IF EXISTS idx_bookings_docplanner_id;

-- Step 3: Add UNIQUE constraint.
-- NULL docplanner_booking_id values are always treated as distinct
-- by PostgreSQL, so manual bookings (docplanner_booking_id IS NULL)
-- are unaffected.
ALTER TABLE public.bookings
  ADD CONSTRAINT uq_bookings_company_docplanner
  UNIQUE (company_id, docplanner_booking_id);
