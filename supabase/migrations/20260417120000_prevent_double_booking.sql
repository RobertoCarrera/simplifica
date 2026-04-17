-- Prevent double-booking: atomic slot reservation via DB function
-- Uses FOR UPDATE SKIP LOCKED to handle concurrent requests safely

CREATE OR REPLACE FUNCTION book_slot(
  p_professional_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_booking_data jsonb
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conflict uuid;
  v_booking_id uuid;
BEGIN
  -- Check for conflicting bookings (same professional, overlapping time, active status)
  SELECT id INTO v_conflict
  FROM bookings
  WHERE professional_id = p_professional_id
    AND status IN ('confirmed', 'pending')
    AND daterange(start_time, end_time, '[)') && daterange(p_start_time, p_end_time, '[)')
  FOR UPDATE SKIP LOCKED;

  IF v_conflict IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'slot_taken');
  END IF;

  -- Insert the booking
  INSERT INTO bookings (
    professional_id,
    start_time,
    end_time,
    client_id,
    service_id,
    description,
    status,
    session_type,
    company_id,
    resource_id
  ) VALUES (
    p_professional_id,
    p_start_time,
    p_end_time,
    (p_booking_data->>'client_id')::uuid,
    (p_booking_data->>'service_id')::uuid,
    p_booking_data->>'description',
    'confirmed',
    p_booking_data->>'session_type',
    (p_booking_data->>'company_id')::uuid,
    (p_booking_data->>'resource_id')::uuid
  )
  RETURNING id INTO v_booking_id;

  RETURN json_build_object('success', true, 'booking_id', v_booking_id);
END;
$$;

-- Grant execute to anon and authenticated (the frontend uses anon key via RPC)
GRANT EXECUTE ON FUNCTION book_slot TO anon, authenticated;
