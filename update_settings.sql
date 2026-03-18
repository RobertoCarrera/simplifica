-- Update company settings for CAIBS to hide Duration filter
UPDATE public.companies
SET settings = settings || '{"enabled_filters": ["services", "professionals"]}'::jsonb
WHERE slug = 'caibs';

-- Set default for others (all active)
UPDATE public.companies
SET settings = settings || '{"enabled_filters": ["services", "professionals", "duration"]}'::jsonb
WHERE settings->'enabled_filters' IS NULL;
