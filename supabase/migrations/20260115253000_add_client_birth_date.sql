-- Add birth_date column to clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Comment on column
COMMENT ON COLUMN public.clients.birth_date IS 'Client date of birth for marketing automation';
