-- Migration: notify_session_created_trigger
-- Status: applied
-- Date: 2026-04-27
-- Purpose: Fire a webhook to the notifications Edge Function when a new external booking is created.
--
-- Trigger logic:
--   - Fires AFTER INSERT on bookings
--   - Only for external sources: 'docplanner', 'web' (and future external sources)
--   - Skips 'internal' source (internal tooling should not trigger notifications)
--   - Reads the target URL from app.notifications.session_created_url (set via environment)
--
-- Payload sent to Edge Function:
--   { booking_id, company_id, professional_id, client_id, customer_name, start_time, source }
--
-- Related:
--   - Edge Function: notifications/session-created (receives booking_id, creates notification records)
--   - Setting: companies.settings.daily_digest_time (HH:MM string, default "20:00") — stored in jsonb, no migration needed

-- 1. Function -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_session_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_url text;
BEGIN
  -- Only notify for external sources (docplanner, web, etc.)
  -- NOT for 'internal' — internal tools create bookings without triggering notifications
  IF NEW.source IN ('docplanner', 'web') THEN
    v_url := current_setting('app.notifications.session_created_url', true);

    IF v_url IS NOT NULL AND v_url != '' THEN
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json'
        ),
        body    := jsonb_build_object(
          'booking_id',      NEW.id,
          'company_id',     NEW.company_id,
          'professional_id', NEW.professional_id,
          'client_id',     NEW.client_id,
          'customer_name',  NEW.customer_name,
          'start_time',    NEW.start_time,
          'source',        NEW.source
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_session_created() IS
  'Fires net.http_post to the notifications Edge Function when a booking is created from an external source (docplanner, web). '
  'Internal bookings (source=internal) are skipped. '
  'URL is read from app.notifications.session_created_url setting.';

-- 2. Trigger -------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_notify_session_created ON public.bookings;
CREATE TRIGGER trg_notify_session_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_session_created();

COMMENT ON TRIGGER trg_notify_session_created ON public.bookings IS
  'Calls notify_session_created() after each INSERT on bookings. '
  'Only fires when source is in (''docplanner'', ''web''). '
  'Skips internal bookings to avoid notification spam.';