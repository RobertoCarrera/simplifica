-- Add column to store Google Calendar Event ID
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS google_event_id text;

-- Add index for faster lookups during sync
CREATE INDEX IF NOT EXISTS idx_bookings_google_event_id ON bookings(google_event_id);
