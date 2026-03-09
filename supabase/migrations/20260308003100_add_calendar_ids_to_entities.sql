-- Add google_calendar_id to professionals and resources

ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;

ALTER TABLE public.resources 
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;
