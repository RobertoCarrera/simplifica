-- Migration: Add Google Calendar sync toggle to booking notifications
-- --------------------------------------------------------------------
-- Adds a single global switch that controls whether modifications and
-- cancellations of bookings are synced to the operator's Google Calendar
-- (and, as a consequence, whether Google sends its own notification
-- emails to attendees via `sendUpdates=all`).
--
-- Behavior:
--   * true  (default) → frontend calls `google-auth` update-event /
--                       delete-event as before; Google sends attendee
--                       notifications (`sendUpdates=all`).
--   * false           → frontend SKIPS `google-auth` calls entirely.
--                       The Simplifica-branded email (already gated by
--                       `booking_email_enabled`) is unaffected and keeps
--                       sending when that master switch is on.
--
-- This setting is per-company and lives in the same row as the rest of
-- booking notification settings to keep the settings UI simple. RLS
-- already covers all columns of `budget_notification_settings`, so the
-- new column inherits the same access policy automatically.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.budget_notification_settings
  ADD COLUMN IF NOT EXISTS booking_google_calendar_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.budget_notification_settings.booking_google_calendar_enabled IS
  'Si true, al modificar/cancelar una reserva se sincroniza con Google Calendar (y Google notifica a los attendees vía sendUpdates=all). Si false, el frontend skipea las llamadas a google-auth y solo se envía el email branded de Simplifica cuando booking_email_enabled=true.';
