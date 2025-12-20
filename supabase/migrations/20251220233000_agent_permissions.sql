-- Add permissions column for agents
ALTER TABLE public.company_settings 
ADD COLUMN IF NOT EXISTS agent_module_access JSONB DEFAULT '["dashboard", "tickets", "clients", "invoices", "calendar", "services", "products"]'::jsonb;
