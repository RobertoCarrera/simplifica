-- Booking Pipeline Fixes
-- 1. Make booking_type_id nullable (system now uses service_id from refactored schema)
-- 2. Add 'source' column to track booking origin

-- Allow NULL booking_type_id since new bookings use service_id
ALTER TABLE public.bookings ALTER COLUMN booking_type_id DROP NOT NULL;

-- Track booking origin (public portal, internal, API)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'internal';
