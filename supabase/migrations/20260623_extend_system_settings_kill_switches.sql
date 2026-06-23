-- Migration: extend_system_settings_kill_switches
-- Purpose: Extend the global kill switch (commit 2627a334) to cover
--          notify-inactive-clients and marketing-automation crons.
--          These are the other 2 EFs that send emails to clients
--          on a schedule.
--
-- Each toggle has its own paused_at + paused_by columns so the UI
-- can show who paused what and when.

BEGIN;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS notify_inactive_clients_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_inactive_clients_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS notify_inactive_clients_paused_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS marketing_automation_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_automation_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_automation_paused_by uuid REFERENCES auth.users(id);

-- Documentation comments (for the data dictionary / introspection)
COMMENT ON COLUMN public.system_settings.process_reminders_paused IS
  'When true, process-reminders EF (cron hourly) does NOT send client emails: 24h before reminder, 1h before reminder, or 2h-after review request. Last deployed: 2026-03-29, last broken period 2026-03-29 to 2026-06-23 due to deleted full_name reference. Cron: 0 * * * *. To: clients (booking.client.email).';
COMMENT ON COLUMN public.system_settings.notify_inactive_clients_paused IS
  'When true, notify-inactive-clients EF (cron daily 02:30) does NOT send reactivation emails to clients who have not booked in a long time. Cron: 30 2 * * *. To: clients (clients with no recent booking).';
COMMENT ON COLUMN public.system_settings.marketing_automation_paused IS
  'When true, marketing-automation EF (cron daily 09:30) does NOT run marketing campaigns, follow-ups, or lead nurturing sequences. Cron: 30 9 * * *. To: leads and clients per marketing rules.';

COMMIT;