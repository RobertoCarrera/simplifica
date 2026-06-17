-- Migration: Add last_invite_sent_at + last_calendar_sync_at to bookings
-- Date: 2026-06-16
-- Purpose: surface sync status badges in the booking-detail modal:
--   • "Email enviado" when last_invite_sent_at IS NOT NULL
--   • "Sincronizado con Calendar" when google_event_id IS NOT NULL
--     AND last_calendar_sync_at IS NOT NULL
-- The frontend reads these to render the badges (the user-facing
-- "is this booking synced?" indicator). Without these columns, the
-- frontend has no way to know whether the invite was actually sent
-- or whether the event exists in Google Calendar at this moment.
--
-- The columns are written by the `google-auth` Edge Function whenever
-- it successfully creates or re-sends a Calendar event (the
-- `forceFullSync` flow in booking-settings.component.ts also writes
-- last_calendar_sync_at on every recreate, regardless of sendUpdates).
-- Old bookings created before this migration have NULL here; the
-- frontend renders "—" / "Sin datos" for those.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS last_invite_sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_calendar_sync_at TIMESTAMPTZ NULL;

-- Backfill: any booking that has a google_event_id we assume was
-- synced at some point. We don't know the exact moment, so we
-- backfill with the booking's created_at as a reasonable lower
-- bound. last_invite_sent_at stays NULL for old bookings because
-- we have no record of when (or if) the invite was actually sent.
UPDATE public.bookings
  SET last_calendar_sync_at = created_at
  WHERE google_event_id IS NOT NULL
    AND last_calendar_sync_at IS NULL;

COMMENT ON COLUMN public.bookings.last_invite_sent_at IS
  'Timestamp of the most recent Google Calendar invite email that was successfully dispatched for this booking. NULL = never sent or pre-migration.';
COMMENT ON COLUMN public.bookings.last_calendar_sync_at IS
  'Timestamp of the most recent successful Google Calendar event create or update for this booking. NULL = event was never created or pre-migration.';
