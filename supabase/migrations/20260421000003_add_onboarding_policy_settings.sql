ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS onboarding_policy jsonb;

ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS onboarding_policy jsonb;

COMMENT ON COLUMN public.app_settings.onboarding_policy IS
'Default onboarding field policy. Modes: hidden, optional, required.';

COMMENT ON COLUMN public.company_settings.onboarding_policy IS
'Per-company onboarding field policy override. Modes: hidden, optional, required.';