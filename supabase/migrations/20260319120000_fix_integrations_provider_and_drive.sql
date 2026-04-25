-- Allow google_drive as a valid integration provider
-- The original CHECK only listed google_calendar, blocking Drive token storage

ALTER TABLE public.integrations
    DROP CONSTRAINT IF EXISTS integrations_provider_check;

ALTER TABLE public.integrations
    ADD CONSTRAINT integrations_provider_check
        CHECK (provider IN ('google_calendar', 'google_drive'));
