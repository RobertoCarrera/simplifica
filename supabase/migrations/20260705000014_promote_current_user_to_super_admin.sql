-- Promote the currently-logged-in user to super_admin.
-- Identity: digitalizamostupyme@gmail.com (auth_user_id 84b38d8d-...)
-- was created today as 'owner'. Promoting it to super_admin so it can
-- use /admin/modulos (plan toggles, gifts, add-on management).
--
-- The change is idempotent: if the user is already super_admin, no-op.

UPDATE public.users u
SET app_role_id = (SELECT id FROM public.app_roles WHERE name = 'super_admin'),
    updated_at = now()
WHERE u.auth_user_id = '84b38d8d-5457-4fac-8d5f-eb58ada40341'
  AND u.app_role_id IS DISTINCT FROM (SELECT id FROM public.app_roles WHERE name = 'super_admin');

-- Verify
SELECT u.email, ar.name AS app_role, u.company_id
FROM public.users u
LEFT JOIN public.app_roles ar ON ar.id = u.app_role_id
WHERE u.auth_user_id = '84b38d8d-5457-4fac-8d5f-eb58ada40341';
