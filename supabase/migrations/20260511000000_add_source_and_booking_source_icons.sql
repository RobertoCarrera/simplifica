-- ============================================
-- Booking Source and Room Assignment
-- Phase 1: DB Migration (Foundation)
-- ============================================
-- Adds source column to bookings, creates booking_source_icons table
-- with owner-only CRUD, and create_booking_with_resource RPC for
-- atomic room assignment before booking insert.
-- ============================================

-- STEP 1: Update existing source column default from 'internal' to 'admin'
-- Existing bookings keep their source value; new bookings default to 'admin'

ALTER TABLE bookings
  ALTER COLUMN source SET DEFAULT 'admin',
  ALTER COLUMN source SET NOT NULL;

COMMENT ON COLUMN bookings.source IS
  'Booking origin: agenda (from agenda form), admin (manual), professional (pro booking), docplanner (external sync)';

-- STEP 2: Create booking_source_icons table

CREATE TABLE IF NOT EXISTS booking_source_icons (
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('agenda', 'admin', 'professional', 'docplanner')),
  icon text NOT NULL,
  label text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (company_id, source)
);

COMMENT ON TABLE booking_source_icons IS
  'Per-company icon and label config for booking sources (agenda/admin/professional/docplanner)';

-- STEP 3: Enable RLS

ALTER TABLE booking_source_icons ENABLE ROW LEVEL SECURITY;

-- STEP 4: Helper function to check if user is owner/super_admin in a company

CREATE OR REPLACE FUNCTION is_company_owner(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members cm
    JOIN public.app_roles ar ON ar.id = cm.role_id
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = p_company_id
      AND cm.status = 'active'
      AND ar.name IN ('owner', 'super_admin')
  );
$$;

-- STEP 5: RLS policies for booking_source_icons

-- SELECT: any authenticated user in the company can read
DROP POLICY IF EXISTS "booking_source_icons_select" ON booking_source_icons;
CREATE POLICY "booking_source_icons_select" ON booking_source_icons
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = booking_source_icons.company_id
        AND cm.status = 'active'
    )
  );

-- INSERT: only owner/super_admin can create
DROP POLICY IF EXISTS "booking_source_icons_insert" ON booking_source_icons;
CREATE POLICY "booking_source_icons_insert" ON booking_source_icons
  FOR INSERT WITH CHECK (is_company_owner(company_id));

-- UPDATE: only owner/super_admin can update
DROP POLICY IF EXISTS "booking_source_icons_update" ON booking_source_icons;
CREATE POLICY "booking_source_icons_update" ON booking_source_icons
  FOR UPDATE USING (is_company_owner(company_id));

-- DELETE: only owner/super_admin can delete
DROP POLICY IF EXISTS "booking_source_icons_delete" ON booking_source_icons;
CREATE POLICY "booking_source_icons_delete" ON booking_source_icons
  FOR DELETE USING (is_company_owner(company_id));

-- STEP 6: RPC for atomic booking with room assignment

CREATE OR REPLACE FUNCTION create_booking_with_resource(
  p_professional_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_booking_data jsonb,
  p_source text DEFAULT 'admin'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_resource_id uuid;
  v_booking_id uuid;
  v_company_id uuid;
BEGIN
  -- Get company_id from professional
  SELECT company_id INTO v_company_id FROM professionals WHERE id = p_professional_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'professional_not_found');
  END IF;

  -- Try professional's default_resource_id first
  SELECT resource_id INTO v_resource_id FROM professionals
  WHERE id = p_professional_id AND resource_id IS NOT NULL;

  -- If not set or not available, find any available active room
  IF v_resource_id IS NULL OR EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.resource_id = v_resource_id
      AND b.status != 'cancelled'
      AND b.start_time < p_end_time
      AND b.end_time > p_start_time
    FOR UPDATE
  ) THEN
    SELECT r.id INTO v_resource_id FROM resources r
    WHERE r.company_id = v_company_id
      AND r.is_active = true
      AND r.type = 'room'
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.resource_id = r.id
          AND b.status != 'cancelled'
          AND b.start_time < p_end_time
          AND b.end_time > p_start_time
      )
    LIMIT 1;

    IF v_resource_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'no_room_available');
    END IF;
  END IF;

  -- Insert booking with source
  INSERT INTO bookings (
    company_id, professional_id, resource_id,
    start_time, end_time, source,
    customer_name, customer_email, customer_phone,
    service_id, booking_type_id, status
  ) VALUES (
    v_company_id, p_professional_id, v_resource_id,
    p_start_time, p_end_time, p_source,
    (p_booking_data->>'customer_name')::text,
    (p_booking_data->>'customer_email')::text,
    (p_booking_data->>'customer_phone')::text,
    (p_booking_data->>'service_id')::uuid,
    (p_booking_data->>'booking_type_id')::uuid,
    'confirmed'
  ) RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'resource_id', v_resource_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking_with_resource TO anon, authenticated;

-- STEP 7: Seed default icons for all 4 sources per company
-- Uses a function that inserts only if not exists

CREATE OR REPLACE FUNCTION seed_booking_source_icons_for_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- agenda
  INSERT INTO booking_source_icons (company_id, source, icon, label)
  VALUES (p_company_id, 'agenda', '📅', 'Agenda')
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

-- Seed for all existing companies
DO $$
DECLARE
  rec uuid;
BEGIN
  FOR rec IN SELECT id FROM companies LOOP
    PERFORM seed_booking_source_icons_for_company(rec);
  END LOOP;
END;
$$;