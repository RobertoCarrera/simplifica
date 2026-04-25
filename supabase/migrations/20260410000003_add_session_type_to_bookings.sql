-- Add session_type column to bookings
-- 'presencial' = in-person appointment
-- 'online' = remote session (generates Google Meet link)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'presencial'
    CHECK (session_type IN ('presencial', 'online'));

COMMENT ON COLUMN bookings.session_type IS 'Type of session: presencial (in-person) or online (generates Meet link)';
