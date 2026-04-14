-- Fix: replace app.settings.service_role_key with vault.decrypted_secrets lookup.
-- ALTER DATABASE SET requires superuser (not available in Supabase hosted projects).
-- pg_cron jobs run as postgres, which has full vault access — use that instead.
--
-- PREREQ (one-time, via Supabase Dashboard):
--   1. Dashboard → Settings → API → copy "service_role" key
--   2. Dashboard → Settings → Vault → New secret
--        Name:  service_role_key
--        Value: <paste the service_role key>

DO $$
BEGIN
  BEGIN SELECT cron.unschedule('notify-inactive-clients'); EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

SELECT cron.schedule(
  'notify-inactive-clients',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/notify-inactive-clients',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (
                   SELECT decrypted_secret
                   FROM vault.decrypted_secrets
                   WHERE name = 'service_role_key'
                   LIMIT 1
                 )
               ),
    body    := '{}'::jsonb
  ) AS request_id
  $$
);
