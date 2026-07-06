-- Auto-sync for supplier products via pg_cron
-- Calls the auto-sync-suppliers Edge Function every 6 hours.
-- Prerequisites:
--   1. pg_cron extension enabled in the project (Dashboard → Database → Extensions)
--   2. The auto-sync-suppliers EF deployed (it is)
--   3. supplier_supabase_url, supplier_service_role_key set as current_setting
--      (this is already done by the EF infrastructure)

-- 1. Add a last_sync_at column to track the most recent sync per supplier
ALTER TABLE public.catalog_suppliers
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ;

-- 2. The schedule: every 6 hours, call the EF
-- Requires pg_cron and pg_net extensions
-- Uses the project's own service_role key for the call

SELECT cron.schedule(
  'auto-sync-suppliers-every-6h',
  '0 */6 * * *',  -- every 6 hours at minute 0
  $$
  SELECT net.http_post(
    url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/auto-sync-suppliers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3. Manually trigger a sync right now (don't wait for the next cron)
SELECT net.http_post(
  url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/auto-sync-suppliers',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
  ),
  body := '{}'::jsonb
);

-- 4. Verify
SELECT jobname, schedule, active FROM cron.job;