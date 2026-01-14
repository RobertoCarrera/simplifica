-- Enable pg_cron and pg_net extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule the job to run every hour at minute 0
select
  cron.schedule(
    'process-reminders-hourly', -- Unique name for the job
    '0 * * * *',                -- Cron expression: Every hour at minute 0
    $$
    select
      net.http_post(
          url:='https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/process-reminders',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
  );

-- Verify the job was created
select * from cron.job;
