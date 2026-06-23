-- Migration: Add marketer role for marketing collaborators
-- Description: Owners can invite external marketing/web marketing collaborators with minimal permissions

INSERT INTO public.app_roles (name, label, description)
VALUES ('marketer', 'Marketing', 'Colaborador de marketing y web marketing')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
