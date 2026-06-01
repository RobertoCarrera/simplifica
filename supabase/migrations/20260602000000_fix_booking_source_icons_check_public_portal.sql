-- ============================================
-- Fix: booking_source_icons CHECK constraint
-- ============================================
-- Problem: The CHECK constraint only allowed 'agenda' but the
-- application (frontend + edge function booking-public) uses
-- 'public_portal' as the source key for public-agenda bookings.
-- This caused: "new row for relation 'booking_source_icons'
-- violates check constraint 'booking_source_icons_source_check'"
-- when saving settings at "Reservas > Configuración > General".
-- ============================================

-- STEP 1: Drop the old CHECK constraint and add the corrected one
ALTER TABLE booking_source_icons
  DROP CONSTRAINT IF EXISTS booking_source_icons_source_check;

ALTER TABLE booking_source_icons
  ADD CONSTRAINT booking_source_icons_source_check
  CHECK (source IN ('public_portal', 'admin', 'professional', 'docplanner'));

-- STEP 2: Migrate any existing rows that use 'agenda' to 'public_portal'
-- (upsert protects against conflicts since PK is (company_id, source))
UPDATE booking_source_icons
SET source = 'public_portal'
WHERE source = 'agenda';

-- STEP 3: Update the seed function to use 'public_portal' instead of 'agenda'
CREATE OR REPLACE FUNCTION seed_booking_source_icons_for_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- public_portal
  INSERT INTO booking_source_icons (company_id, source, icon, label)
  VALUES (p_company_id, 'public_portal', '📅', 'Agenda')
  ON CONFLICT (company_id, source) DO NOTHING;

  -- admin
  INSERT INTO booking_source_icons (company_id, source, icon, label)
  VALUES (p_company_id, 'admin', '👤', 'Admin')
  ON CONFLICT (company_id, source) DO NOTHING;

  -- professional
  INSERT INTO booking_source_icons (company_id, source, icon, label)
  VALUES (p_company_id, 'professional', '💼', 'Professional')
  ON CONFLICT (company_id, source) DO NOTHING;

  -- docplanner
  INSERT INTO booking_source_icons (company_id, source, icon, label)
  VALUES (p_company_id, 'docplanner', '🔗', 'Docplanner')
  ON CONFLICT (company_id, source) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_booking_source_icons_for_company TO anon, authenticated;
