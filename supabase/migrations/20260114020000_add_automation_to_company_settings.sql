-- Add automation column to company_settings table
ALTER TABLE IF EXISTS company_settings 
ADD COLUMN IF NOT EXISTS automation JSONB DEFAULT '{}'::jsonb;

-- Comment on column
COMMENT ON COLUMN company_settings.automation IS 'Stores configuration for automated communications like reminders and reviews.';
