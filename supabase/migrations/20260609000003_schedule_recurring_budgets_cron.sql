-- Migration: Schedule recurring budget generation cron job
-- Runs daily at 1:00 AM UTC via pg_cron → Edge Function
-- Requires: pg_cron + pg_net extensions (both available in Supabase hosted projects)
--
-- If the Supabase project doesn't have pg_cron/pg_net, the function can also
-- be scheduled via the Supabase Dashboard or config.toml:
--   [functions.generate-recurring-budgets]
--   schedule = "0 1 * * *"
--
-- PREREQ before deploying to production — run once in Supabase Dashboard > SQL Editor:
--   SELECT vault.create_secret('supabase_url', '<your-supabase-url>');
--   SELECT vault.create_secret('service_role_key', '<your-service-role-key>');
-- Then set the GUCs:
--   ALTER DATABASE postgres
--     SET app.settings.supabase_url = '<your-supabase-url>';
--   ALTER DATABASE postgres
--     SET app.settings.service_role_key = '<your-service-role-key>';

-- Enable extensions (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule daily run at 1:00 AM UTC
-- Calls the Edge Function which invokes generate_recurring_budgets(target_date)
-- Handles dedup via UNIQUE(client_id, period) constraint
SELECT cron.schedule(
  'generate-recurring-budgets',
  '0 1 * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-recurring-budgets',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      )
    ) AS request_id;
  $$
);

-- Also schedule a weekly dry-run report (Mondays at 7:00 AM UTC)
-- This runs in dry_run mode so admins can preview what would be generated
SELECT cron.schedule(
  'generate-recurring-budgets-dry-run',
  '0 7 * * 1',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/generate-recurring-budgets?dry_run=true',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      )
    ) AS request_id;
  $$
);
