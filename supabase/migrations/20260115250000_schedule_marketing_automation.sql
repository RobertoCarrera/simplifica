-- Enable pg_cron and pg_net if not exists
create extension if not exists pg_cron;
create extension if not exists pg_net;

create extension if not exists supabase_vault;

-- Schedule Marketing Automation Daily at 9:30 AM
-- Calls the process-automation Edge Function

SELECT cron.schedule(
    'marketing-automation-daily',
    '30 9 * * *',
    $$
    SELECT
      net.http_post(
          url:='https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/process-automation',
          headers:=jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
          ),
          body:='{}'::jsonb
      ) as request_id;
    $$
);
