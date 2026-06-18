-- Migration: aws-jobs-processor cron
-- Schedules the aws-jobs-processor edge function to run every 5 minutes.
-- This is the safety net for SES receipt rule + MX record provisioning:
--   if the live API call in ses-inbound-provision fails, a job is enqueued
--   and this cron retries it with exponential backoff.
--
-- Requires: pg_cron + pg_net (already enabled in previous migrations).
--
-- Schedule:
--   Every 5 minutes → POST /aws-jobs-processor/run with service role auth

-- 1. Schedule the job processor (every 5 minutes)
SELECT cron.schedule(
  'aws-jobs-processor-5min',
  '*/5 * * * *',
  $$
  SELECT
    net.http_post(
      url := concat(
        current_setting('app.settings.supabase_url', true),
        '/functions/v1/aws-jobs-processor/run'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', concat('Bearer ', current_setting('app.settings.service_role_key', true))
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    ) AS request_id;
  $$
);

-- 2. Schedule a daily healthcheck at 04:00 UTC (low traffic window)
--    This catches drift between DB state and AWS SES rules.
SELECT cron.schedule(
  'aws-inbound-healthcheck-daily',
  '0 4 * * *',
  $$
  SELECT
    net.http_post(
      url := concat(
        current_setting('app.settings.supabase_url', true),
        '/functions/v1/ses-inbound-provision/healthcheck'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', concat('Bearer ', current_setting('app.settings.service_role_key', true))
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    ) AS request_id;
  $$
);

-- Note: prereq in Supabase Dashboard > SQL Editor (run once if not already set):
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<your-service-role-key>';
