
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS auto_send_quote_email boolean DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS default_auto_send_quote_email boolean DEFAULT false;
