-- Migration to enable Automatic Booking Notifications via Edge Function

-- 1. Enable pg_net extension for async HTTP requests
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- 2. Create the Trigger Function
CREATE OR REPLACE FUNCTION public.notify_booking_notifier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/booking-notifier';
    v_secret TEXT := 'simplifica-booking-webhook-secret';
    v_payload JSONB;
BEGIN
    -- Construct Payload
    v_payload := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA,
        'record', row_to_json(NEW),
        'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
    );

    -- Send Async Request
    -- We use PERFORM to discard the result (request_id)
    PERFORM net.http_post(
        url := v_url,
        body := v_payload,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', v_secret
        )
    );

    RETURN NEW;
END;
$$;

-- 3. Create the Trigger
DROP TRIGGER IF EXISTS on_booking_changes ON public.bookings;

CREATE TRIGGER on_booking_changes
    AFTER INSERT OR UPDATE OF status, start_time, end_time
    ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_booking_notifier();
