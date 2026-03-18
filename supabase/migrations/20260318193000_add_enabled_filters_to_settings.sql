-- Migration for adding enabled_filters to company_settings
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS enabled_filters text[];

-- Set default filters for existing companies
UPDATE company_settings 
SET enabled_filters = ARRAY['services', 'professionals', 'duration'] 
WHERE enabled_filters IS NULL;
