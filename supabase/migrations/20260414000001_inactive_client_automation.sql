-- Migration: inactive client automation
-- Marks clients with no bookings in 90 days as is_active=false and notifies company owners.
-- Requires: pg_cron + pg_net (both available in Supabase hosted projects).
--
-- Cron schedule:
--   02:00 UTC → process_inactive_clients() (SQL: deactivates + logs)
--   02:30 UTC → notify-inactive-clients edge function via pg_net
--
-- PREREQ before deploying to production — run once in Supabase Dashboard > SQL Editor:
--   ALTER DATABASE postgres
--     SET app.settings.service_role_key = '<your-service-role-key>';

-- 1. Enable extensions ------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Log table: records which clients were auto-deactivated (used by edge function) ---

CREATE TABLE IF NOT EXISTS public.client_inactivity_log (
  id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id   uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id  uuid        NOT NULL,
  client_name text,
  marked_at   timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

-- Fast lookup for pending (unnotified) entries per company
CREATE INDEX IF NOT EXISTS idx_client_inactivity_log_pending
  ON public.client_inactivity_log (company_id, marked_at)
  WHERE notified_at IS NULL;

-- Only service role can access this table (no public RLS policies)
ALTER TABLE public.client_inactivity_log ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.client_inactivity_log IS
  'Audit log of clients auto-deactivated by process_inactive_clients(). '
  'Consumed by notify-inactive-clients edge function. Safe to clean up entries older than 30 days.';

-- 3. Function: deactivates inactive clients atomically with logging -----------------

CREATE OR REPLACE FUNCTION public.process_inactive_clients()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Atomically deactivate eligible clients and log the ones just deactivated.
  -- Eligible: active, not soft-deleted, created >90 days ago, no bookings in last 90 days.
  WITH deactivated AS (
    UPDATE public.clients
    SET    is_active  = false,
           deleted_at = now()
    WHERE  is_active  = true
      AND  deleted_at IS NULL
      AND  created_at <= now() - interval '90 days'
      AND  NOT EXISTS (
             SELECT 1 FROM public.bookings b
             WHERE  b.client_id = clients.id
               AND  b.start_time >= now() - interval '90 days'
           )
    RETURNING id, company_id, name, surname
  )
  INSERT INTO public.client_inactivity_log (client_id, company_id, client_name)
  SELECT
    id,
    company_id,
    trim(name || CASE WHEN surname IS NOT NULL AND surname <> '' THEN ' ' || surname ELSE '' END)
  FROM deactivated;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.process_inactive_clients() IS
  'Called daily by pg_cron at 02:00 UTC. '
  'Deactivates clients with no bookings in the past 90 days and logs them '
  'to client_inactivity_log for email notification.';

-- Only the pg_cron worker (postgres superuser) should execute this
REVOKE ALL ON FUNCTION public.process_inactive_clients() FROM PUBLIC;

-- 4. Cron jobs (idempotent: remove existing before re-creating) --------------------

DO $$
BEGIN
  BEGIN SELECT cron.unschedule('process-inactive-clients'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN SELECT cron.unschedule('notify-inactive-clients');  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- 02:00 UTC daily: mark clients inactive
SELECT cron.schedule(
  'process-inactive-clients',
  '0 2 * * *',
  $$SELECT public.process_inactive_clients()$$
);

-- 02:30 UTC daily: trigger notification edge function via pg_net
-- Uses app.settings.service_role_key (set via ALTER DATABASE as described above).
SELECT cron.schedule(
  'notify-inactive-clients',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1/notify-inactive-clients',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
               ),
    body    := '{}'::jsonb
  ) AS request_id
  $$
);
