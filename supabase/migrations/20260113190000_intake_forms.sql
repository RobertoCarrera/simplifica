-- Migration: Add Intake Forms support
-- Adds form_schema to services (to define questions)
-- Adds form_responses to bookings (to store answers)

ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS form_schema JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS form_responses JSONB DEFAULT '{}'::jsonb;

-- Comment for documentation
COMMENT ON COLUMN public.services.form_schema IS 'JSON array defining custom intake questions (id, type, label, required)';
COMMENT ON COLUMN public.bookings.form_responses IS 'JSON object storing answers to intake questions (key=id, value=answer)';
