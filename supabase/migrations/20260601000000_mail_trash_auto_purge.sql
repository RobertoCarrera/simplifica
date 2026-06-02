-- Add pg_cron job to auto-purge mail trash older than 60 days.
-- Runs daily at 3:00 AM UTC.
-- Requires pg_cron extension to be enabled.
SELECT cron.schedule(
  'mail-trash-auto-purge',
  '0 3 * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/mail-trash-auto-purge',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      )
    ) AS request_id;
  $$
);
