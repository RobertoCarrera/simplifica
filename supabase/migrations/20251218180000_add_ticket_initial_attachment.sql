-- Add initial_attachment_url column to tickets table
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS initial_attachment_url text;

-- Add comment explaining usage
COMMENT ON COLUMN public.tickets.initial_attachment_url IS 'URL of the initial attachment (e.g. image) uploaded during ticket creation, especially for Question type tickets.';
