-- Add copy_features_between_variants column to company_settings table
ALTER TABLE company_settings 
ADD COLUMN IF NOT EXISTS copy_features_between_variants BOOLEAN DEFAULT FALSE;

-- Update the comment/description if needed
COMMENT ON COLUMN company_settings.copy_features_between_variants IS 'If true, features are copied between variants in services';
