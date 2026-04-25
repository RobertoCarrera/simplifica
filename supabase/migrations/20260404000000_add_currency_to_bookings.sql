-- =============================================================================
-- Add missing 'currency' column to bookings table
-- =============================================================================
-- This column was defined in migration 20260322100005 but was not applied
-- to production (the migration record was registered but the DDL did not run).
-- The frontend client-bookings component requests this column via PostgREST
-- and was getting error 42703 (column does not exist).
-- =============================================================================

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';
