-- Update create_booking_with_resource to check professional and service blocked dates

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
  v_service_id uuid;
  v_conflict uuid;
BEGIN
  v_service_id := (p_booking_data->>'service_id')::uuid;

  -- Get company_id from professional
  SELECT company_id INTO v_company_id FROM professionals WHERE id = p_professional_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'professional_not_found');
  END IF;

  -- 1. Check professional-level blocked dates
  SELECT id INTO v_conflict
  FROM professional_blocked_dates
  WHERE professional_id = p_professional_id
    AND (
      (all_day = true AND daterange(start_date, end_date, '[]') && daterange(p_start_time::date, p_end_time::date, '[]'))
      OR
      (all_day = false
       AND daterange(start_date, end_date, '[]') && daterange(p_start_time::date, p_end_time::date, '[]')
       AND start_time IS NOT NULL AND end_time IS NOT NULL
       AND p_start_time::time < end_time
       AND p_end_time::time > start_time)
    )
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'professional_blocked');
  END IF;

  -- 2. Check service-level blocked dates (if service_id is provided and professional performs it)
  IF v_service_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM professional_services ps
      WHERE ps.professional_id = p_professional_id
        AND ps.service_id = v_service_id
    ) THEN
      SELECT sbd.id INTO v_conflict
      FROM service_blocked_dates sbd
      WHERE sbd.service_id = v_service_id
        AND (
          (sbd.all_day = true AND daterange(sbd.start_date, sbd.end_date, '[]') && daterange(p_start_time::date, p_end_time::date, '[]'))
          OR
          (sbd.all_day = false
           AND daterange(sbd.start_date, sbd.end_date, '[]') && daterange(p_start_time::date, p_end_time::date, '[]')
           AND sbd.start_time IS NOT NULL AND sbd.end_time IS NOT NULL
           AND p_start_time::time < sbd.end_time
           AND p_end_time::time > sbd.start_time)
        )
      LIMIT 1;

      IF v_conflict IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'service_blocked');
      END IF;
    END IF;
  END IF;

  -- 3. Try professional's default_resource_id first
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
    v_service_id,
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
