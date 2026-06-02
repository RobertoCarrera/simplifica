-- BLINDAJE: Trigger que impide asignar reservas a profesionales con fechas bloqueadas.
-- Cubre TODOS los paths: RPCs, edge functions, Docplanner webhooks/sync, INSERT/UPDATE directos.
-- Es la red de seguridad final — Ningún INSERT o UPDATE que asigne o modifique un profesional
-- en una fecha bloqueada (por profesional O por servicio) puede pasar sin que el trigger lo rechace.
-- Verifica: (1) professional_blocked_dates, (2) service_blocked_dates vía professional_services.

-- ============================================================================
-- 1. Función compartida: detecta si un profesional tiene fechas bloqueadas
-- ============================================================================

CREATE OR REPLACE FUNCTION check_professional_blocked(
  p_professional_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_blocked boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM professional_blocked_dates
    WHERE professional_id = p_professional_id
      AND daterange(start_date, end_date, '[]') && daterange(p_start_time::date, p_end_time::date, '[]')
      AND (
        all_day = true
        OR (
          all_day = false
          AND start_time IS NOT NULL
          AND end_time IS NOT NULL
          AND p_start_time::time < end_time
          AND p_end_time::time > start_time
        )
      )
  ) INTO v_blocked;

  RETURN v_blocked;
END;
$$;

COMMENT ON FUNCTION check_professional_blocked(uuid, timestamptz, timestamptz) IS
  'Returns true if the professional has any blocked date overlapping the given time range.';

-- ============================================================================
-- 2. Función del trigger: se dispara en INSERT/UPDATE de bookings
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_check_blocked_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_blocked boolean;
BEGIN
  -- Only check when professional_id is set and status is not cancelled
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

  -- Check professional blocked dates
  v_blocked := check_professional_blocked(
    NEW.professional_id,
    NEW.start_time,
    NEW.end_time
  );

  IF v_blocked THEN
    RAISE EXCEPTION 'BlockedDateConflict: El profesional tiene esta fecha bloqueada.'
      USING ERRCODE = 'P0001';  -- raise_exception
  END IF;

  -- Check service-level blocked dates (only if booking has a service_id)
  IF NEW.service_id IS NOT NULL THEN
    -- Only block if this professional actually performs this service
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

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. Trigger BEFORE INSERT OR UPDATE en bookings
-- ============================================================================

DROP TRIGGER IF EXISTS trg_bookings_blocked_dates ON bookings;

CREATE TRIGGER trg_bookings_blocked_dates
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trg_check_blocked_dates();

COMMENT ON TRIGGER trg_bookings_blocked_dates ON bookings IS
  'Rejects bookings assigned to professionals with blocked dates. Catch-all safety net — works regardless of path (RPC, edge function, webhook, direct SQL).';
