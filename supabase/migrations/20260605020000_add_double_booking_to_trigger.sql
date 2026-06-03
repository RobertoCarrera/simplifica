-- Add double-booking check to the blocked-dates trigger.
-- Now the trigger covers ALL paths with three validations:
--   1. Professional blocked dates
--   2. Service blocked dates (via professional_services)
--   3. Double-booking (same professional, overlapping active bookings)
--
-- The existing RPC checks in book_slot and create_booking_with_resource act as
-- the optimistic fast-path with nice error messages. This trigger is the
-- safety net that catches direct INSERTs (Docplanner, createBooking, etc.).

CREATE OR REPLACE FUNCTION trg_check_blocked_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_blocked boolean;
  v_conflict_id uuid;
BEGIN
  -- Only check when professional_id is set
  IF NEW.professional_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- If this is an UPDATE and the professional/date hasn't changed, skip
  IF TG_OP = 'UPDATE' THEN
    IF OLD.professional_id = NEW.professional_id
       AND OLD.start_time = NEW.start_time
       AND OLD.end_time = NEW.end_time THEN
      RETURN NEW;
    END IF;
  END IF;

  -- =========================================================================
  -- 1. Check professional blocked dates
  -- =========================================================================
  v_blocked := check_professional_blocked(
    NEW.professional_id,
    NEW.start_time,
    NEW.end_time
  );

  IF v_blocked THEN
    RAISE EXCEPTION 'BlockedDateConflict: El profesional tiene esta fecha bloqueada.'
      USING ERRCODE = 'P0001';
  END IF;

  -- =========================================================================
  -- 2. Check service-level blocked dates
  -- =========================================================================
  IF NEW.service_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM professional_services ps
      WHERE ps.professional_id = NEW.professional_id
        AND ps.service_id = NEW.service_id
    ) THEN
      IF EXISTS (
        SELECT 1 FROM service_blocked_dates sbd
        WHERE sbd.service_id = NEW.service_id
          AND daterange(sbd.start_date, sbd.end_date, '[]') && daterange(NEW.start_time::date, NEW.end_time::date, '[]')
          AND (
            sbd.all_day = true
            OR (
              sbd.all_day = false
              AND sbd.start_time IS NOT NULL
              AND sbd.end_time IS NOT NULL
              AND NEW.start_time::time < sbd.end_time
              AND NEW.end_time::time > sbd.start_time
            )
          )
      ) THEN
        RAISE EXCEPTION 'BlockedDateConflict: El servicio está bloqueado en esta fecha para todos los profesionales.'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- =========================================================================
  -- 3. Check double-booking (same professional, overlapping active bookings)
  -- =========================================================================
  SELECT b.id INTO v_conflict_id
  FROM bookings b
  WHERE b.professional_id = NEW.professional_id
    AND b.status IN ('confirmed', 'pending')
    AND b.start_time < NEW.end_time
    AND b.end_time > NEW.start_time
    AND b.id IS DISTINCT FROM NEW.id  -- exclude self on UPDATE
  LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'DoubleBookingConflict: El profesional ya tiene una reserva en este horario (reserva %).', v_conflict_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_check_blocked_dates() IS
  'Trigger function: rejects bookings on blocked dates (professional + service) and prevents double-booking for the same professional. Fires BEFORE INSERT OR UPDATE on bookings.';
