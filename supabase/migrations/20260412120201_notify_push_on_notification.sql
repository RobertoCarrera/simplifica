-- Trigger: send a Web Push notification whenever a row is inserted into notifications.
-- Uses pg_net (already enabled in this project) to call the send-push-notification edge function.
-- The service_role_key is read from Supabase Vault (same pattern as notify-inactive-clients cron).
--
-- PREREQ (one-time, via Supabase Dashboard → Vault):
--   A secret named "service_role_key" must already exist (created for the inactive-clients cron).

CREATE OR REPLACE FUNCTION notify_push_on_notification_insert()
RETURNS trigger AS $$
DECLARE
  _service_key text;
  _supabase_url text := 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
BEGIN
  -- Only fire for notifications aimed at internal users (not client portal)
  IF NEW.recipient_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Read service role key from Vault (same secret used by inactive-clients cron)
  SELECT decrypted_secret INTO _service_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF _service_key IS NULL THEN
    RAISE WARNING '[notify_push] service_role_key not found in vault — skipping push';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := _supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body    := jsonb_build_object(
      'user_id', NEW.recipient_id,
      'title',   NEW.title,
      'body',    COALESCE(NEW.content, ''),
      'tag',     COALESCE(NEW.type, 'default')
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger (idempotent: drop if exists first)
DROP TRIGGER IF EXISTS trg_push_on_notification_insert ON notifications;

CREATE TRIGGER trg_push_on_notification_insert
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_push_on_notification_insert();
