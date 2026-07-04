-- Backfill admin-only modules that exist in the sidebar but were never
-- added to modules_catalog. These are core admin tools (webmail admin,
-- inbound mail, system health, modules admin itself) so scope='core' and
-- superadmin_only=true.

INSERT INTO public.modules_catalog (key, label, icon, scope, superadmin_only, is_dev_mode)
VALUES
  ('core_/webmail-admin',       'Admin Webmail',       'fa-shield-alt', 'core', true, false),
  ('core_/admin/modulos',       'Gestión Módulos',     'fa-sliders-h',  'core', true, false),
  ('core_/inbound-mail',        'Recepción de correo', 'fa-envelope',   'core', true, false),
  ('core_/admin/inbound-mail',  'Admin Recepción',     'fa-shield-alt', 'core', true, false),
  ('core_/admin/system-health', 'Estado del sistema',  'fa-heartbeat',  'core', true, false)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
