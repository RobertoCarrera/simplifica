-- Enable pg_cron and pg_net if not exists
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule Marketing Automation Daily at 9:30 AM
-- Calls the process-automation Edge Function

SELECT cron.schedule(
    'marketing-automation-daily',
    '30 9 * * *',
    $$
    SELECT
      net.http_post(
          url:='https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/process-automation',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_secret_g27uyjuwEIRZDUsnH2oyxw_TqNsYmhO"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
);
