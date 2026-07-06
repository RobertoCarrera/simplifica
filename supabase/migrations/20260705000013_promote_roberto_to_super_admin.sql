-- Promote Roberto to super_admin. The is_super_admin column does not exist on
-- public.users (super-admin status is conveyed solely via app_role_id pointing
-- to the app_roles row named 'super_admin'). This migration is idempotent:
-- if Roberto is already super_admin the UPDATE is a no-op.

INSERT INTO public.app_roles (name, label, description)
VALUES ('super_admin', 'Super Admin', 'Platform-wide administrator')
ON CONFLICT (name) DO NOTHING;

UPDATE public.users u
SET app_role_id = (SELECT id FROM public.app_roles WHERE name = 'super_admin'),
    updated_at = now()
WHERE u.email = 'roberto@simplificacrm.es'
  AND u.app_role_id IS DISTINCT FROM (SELECT id FROM public.app_roles WHERE name = 'super_admin');

-- Show the result
SELECT u.email, ar.name AS app_role, u.company_id, u.auth_user_id
FROM public.users u
LEFT JOIN public.app_roles ar ON ar.id = u.app_role_id
WHERE u.email = 'roberto@simplificacrm.es';