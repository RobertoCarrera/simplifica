-- Add unique constraint for integrations upsert
ALTER TABLE public.integrations
ADD CONSTRAINT integrations_user_id_provider_key UNIQUE (user_id, provider);
