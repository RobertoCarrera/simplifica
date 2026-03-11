-- Add default_calendar_view column to company_settings table
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS default_calendar_view text DEFAULT 'month';

-- Comment explaining the column
COMMENT ON COLUMN company_settings.default_calendar_view IS 'Default calendar view (month, week, 3days, day, agenda) for the company bookings dashboard.';
