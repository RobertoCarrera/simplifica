-- Add allow_unregistered_client_invites setting
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS allow_unregistered_client_invites BOOLEAN DEFAULT false;
