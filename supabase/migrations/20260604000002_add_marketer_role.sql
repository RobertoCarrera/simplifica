-- Add 'marketer' role to app_roles table.
-- This role is for marketing team members who need access to campaigns,
-- communications, and analytics features.
INSERT INTO public.app_roles (name, label, description)
VALUES ('marketer', 'Marketing', 'Usuario del equipo de marketing con acceso a campañas, comunicaciones y análisis')
ON CONFLICT (name) DO NOTHING;

NOTIFY pgrst, 'reload schema';
