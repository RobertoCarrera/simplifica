-- Migration: add dp_service_unmapped flag to bookings table
-- Flags DocPlanner bookings whose service could not be mapped to a CRM service.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dp_service_unmapped boolean NOT NULL DEFAULT false;
