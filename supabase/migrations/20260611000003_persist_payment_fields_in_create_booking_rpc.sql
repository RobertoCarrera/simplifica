-- Migration: Persist payment_method and payment_status from booking_data
-- when create_booking_with_resource is called.
--
-- Root cause: the event-form modal's 'Crear y marcar como pagado' button
-- sets bookingData.payment_method (one of cash/card/bizum/online) and
-- bookingData.payment_status = 'paid', then passes the whole object to
-- bookSlot() in the frontend. The frontend bookSlot() routes to the
-- create_booking_with_resource RPC for any source other than 'admin'
-- (i.e. professional, docplanner, public_portal) and that RPC's INSERT
-- statement only projected 11 hard-coded columns, silently dropping
-- payment_method and payment_status. Result: the booking was created
-- without the payment fields, and the modal then asked the user to pay
-- again on subsequent opens.
--
-- The payment_method enum was extended in the previous migration
-- (20260611000002) to include 'bizum' and 'online', so the cast to
-- payment_method enum is safe across all four values.

BEGIN;

-- Drop and recreate the function so we can change its body. The
-- signature is unchanged, so all callers continue to work.
DROP FUNCTION IF EXISTS public.create_booking_with_resource(
  uuid, timestamptz, timestamptz, jsonb, text
);

CREATE OR REPLACE FUNCTION public.create_booking_with_resource(
  p_professional_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_booking_data jsonb,
  p_source text DEFAULT 'admin'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_resource_id uuid;
  v_booking_id uuid;
  v_company_id uuid;
  -- Default payment_status to 'pending' when the frontend didn't send
  -- one. The frontend now sets it to 'paid' for the 'Crear y marcar
  -- como pagado' path. The CHECK constraint on bookings.payment_status
  -- accepts only pending/partial/paid/refunded, so we sanitize the
  -- incoming value before INSERT.
  v_payment_status text := CASE
    WHEN p_booking_data->>'payment_status' IN ('pending','partial','paid','refunded')
      THEN p_booking_data->>'payment_status'
    ELSE 'pending'
  END;
BEGIN
  -- Get company_id from professional
  SELECT company_id INTO v_company_id FROM professionals WHERE id = p_professional_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'professional_not_found');
  END IF;

  -- Try professional's default_resource_id first
  SELECT default_resource_id INTO v_resource_id FROM professionals
  WHERE id = p_professional_id AND default_resource_id IS NOT NULL;

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

  -- Insert booking with source + payment fields. payment_method is
  -- cast to the enum type so invalid values raise a clear error
  -- instead of being silently coerced to NULL. payment_status is
  -- a text column (with a CHECK constraint) so we cast to text.
  -- v_payment_status falls back to 'pending' when the frontend
  -- didn't include payment_status.
  INSERT INTO bookings (
    company_id, professional_id, resource_id,
    start_time, end_time, source,
    customer_name, customer_email, customer_phone,
    service_id, booking_type_id, status,
    payment_method, payment_status
  ) VALUES (
    v_company_id, p_professional_id, v_resource_id,
    p_start_time, p_end_time, p_source,
    (p_booking_data->>'customer_name')::text,
    (p_booking_data->>'customer_email')::text,
    (p_booking_data->>'customer_phone')::text,
    (p_booking_data->>'service_id')::uuid,
    (p_booking_data->>'booking_type_id')::uuid,
    'confirmed',
    (p_booking_data->>'payment_method')::public.payment_method,
    v_payment_status
  ) RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'resource_id', v_resource_id
  );
END;
$function$;

COMMIT;
