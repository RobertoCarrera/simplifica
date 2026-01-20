ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_calendar_display_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN companies.google_calendar_display_config IS 'Stores configuration for Google Calendar integration status and preferences';
