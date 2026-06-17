-- ============================================================================
-- booking-retroactive-quote-trigger
-- Retroactively create a draft quote when a booking transitions from
-- NULL to NOT NULL on client_id or service_id.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_generate_quote_on_booking_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quote_result jsonb;
BEGIN
  -- Trigger only on the *transition* from NULL to NOT NULL.
  -- This guarantees no loops: a generated quote does NOT
  -- transition client_id or service_id again through NULL.
  IF NOT (
    (OLD.client_id IS NULL  AND NEW.client_id IS NOT NULL) OR
    (OLD.service_id IS NULL AND NEW.service_id IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  -- Idempotency: don't try if quote already exists.
  IF NEW.quote_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Pre-conditions: client + service must both be set.
  IF NEW.client_id IS NULL OR NEW.service_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Multi-tenant opt-out.
  IF public.get_company_quote_mode(NEW.company_id) = 'manual' THEN
    RETURN NEW;
  END IF;

  -- Concurrency guard.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.id::text));

  -- Delegate to existing RPC (handles its own idempotency).
  SELECT public.generate_quote_from_booking(NEW.id, 'retroactive_trigger')::jsonb
    INTO v_quote_result;

  IF v_quote_result->>'success' = 'false' THEN
    RAISE WARNING 'Retroactive quote generation failed for booking %: %',
      NEW.id, v_quote_result->>'error';
  END IF;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.trg_generate_quote_on_booking_update() TO authenticated, anon;

DROP TRIGGER IF EXISTS trg_generate_quote_on_booking_update ON public.bookings;

CREATE TRIGGER trg_generate_quote_on_booking_update
  AFTER UPDATE OF client_id, service_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_generate_quote_on_booking_update();