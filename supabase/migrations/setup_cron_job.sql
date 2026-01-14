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
          url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/process-reminders',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
          body:='{}'::jsonb
      ) as request_id;
    $$
  );

-- Verify the job was created
select * from cron.job;
