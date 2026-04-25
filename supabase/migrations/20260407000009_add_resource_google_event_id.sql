-- Add column to track the Google Calendar event ID for the room/resource calendar sync.
-- This allows updating/deleting the room's calendar event when a booking changes,
-- independently of the professional's google_event_id.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS resource_google_event_id TEXT;

COMMENT ON COLUMN bookings.resource_google_event_id IS
  'Google Calendar event ID for the resource (room) calendar. Used to update/delete room calendar events when bookings change.';
