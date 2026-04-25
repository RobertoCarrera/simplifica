-- Add HEX color column to professionals for calendar column display
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6366f1';

COMMENT ON COLUMN public.professionals.color IS 'HEX color code used for the professional''s column in the agenda calendar';
