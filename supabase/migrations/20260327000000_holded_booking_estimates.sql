-- ============================================================
-- Holded booking estimates: split invoice trigger into
-- estimate (on confirmed) + invoice (on paid)
-- 2026-03-27
-- ============================================================

-- 1. Add holded_estimate_id column
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS holded_estimate_id text;

COMMENT ON COLUMN public.bookings.holded_estimate_id IS
  'Holded estimate document ID created when booking is confirmed. Null = not yet sent to Holded.';

-- 2. Rename holded_invoice_id comment (was salesreceipt, now invoice)
COMMENT ON COLUMN public.bookings.holded_invoice_id IS
  'Holded invoice document ID created when booking payment is received. Null = not yet sent to Holded.';

-- ─────────────────────────────────────────────────────────────
-- 3. Trigger A: Create estimate when booking is confirmed
--    Fires when status becomes 'confirmed' for the first time
--    (holded_estimate_id still NULL).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_holded_booking_estimate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_url      text;
  v_role_key text;
BEGIN
  IF     NEW.status = 'confirmed'
     AND NEW.holded_estimate_id IS NULL
     AND (
           TG_OP = 'INSERT'
           OR OLD.status IS DISTINCT FROM 'confirmed'
         )
  THEN
    v_url      := current_setting('app.supabase_url',              true);
    v_role_key := current_setting('app.supabase_service_role_key', true);

    IF v_url IS NOT NULL AND v_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/holded-booking-estimate',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_role_key
        ),
        body    := jsonb_build_object('booking_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_holded_booking_estimate ON public.bookings;
CREATE TRIGGER trg_holded_booking_estimate
  AFTER INSERT OR UPDATE OF status
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_holded_booking_estimate();

-- ─────────────────────────────────────────────────────────────
-- 4. Trigger B: Replace existing invoice trigger
--    Now fires only on payment_status='paid' (status can be
--    anything — the edge function will double-check).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_holded_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_url      text;
  v_role_key text;
BEGIN
  IF     NEW.payment_status  = 'paid'
     AND NEW.holded_invoice_id IS NULL
     AND (
           TG_OP = 'INSERT'
           OR OLD.payment_status IS DISTINCT FROM 'paid'
         )
  THEN
    v_url      := current_setting('app.supabase_url',              true);
    v_role_key := current_setting('app.supabase_service_role_key', true);

    IF v_url IS NOT NULL AND v_role_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/holded-booking-invoice',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_role_key
        ),
        body    := jsonb_build_object('booking_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate existing invoice trigger (now fires on payment_status only)
DROP TRIGGER IF EXISTS trg_holded_booking_confirmed ON public.bookings;
CREATE TRIGGER trg_holded_booking_confirmed
  AFTER INSERT OR UPDATE OF payment_status
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_holded_booking_confirmed();

NOTIFY pgrst, 'reload schema';
