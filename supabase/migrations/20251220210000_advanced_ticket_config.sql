-- Add Advanced Config columns to company_settings
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS ticket_client_view_estimated_hours boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS ticket_client_can_close boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS ticket_client_can_create_devices boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS ticket_default_internal_comment boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ticket_auto_assign_on_reply boolean DEFAULT false;

-- Add assigned_to to tickets if it doesn't exist (it should, but safety first)
-- Referencing public.users(id)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='assigned_to') THEN
        ALTER TABLE public.tickets ADD COLUMN assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;
END
$$;
