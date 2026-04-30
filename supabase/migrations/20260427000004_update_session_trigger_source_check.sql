CREATE OR REPLACE FUNCTION notify_session_created()
RETURNS TRIGGER AS $$
DECLARE
  url TEXT;
BEGIN
  -- Only notify for external sources (NOT 'internal' which is manual)
  IF NEW.source IS NOT NULL AND NEW.source != 'internal' AND NEW.source != '' THEN
    SELECT value INTO url FROM app_config WHERE key = 'session_created_url';
    IF url IS NOT NULL AND url != '' THEN
      PERFORM net.http_post(
        url := url,
        body := json_build_object(
          'booking_id', NEW.id,
          'company_id', NEW.company_id,
          'professional_id', NEW.professional_id,
          'client_id', NEW.client_id,
          'customer_name', NEW.customer_name,
          'start_time', NEW.start_time,
          'source', NEW.source
        )::text
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
