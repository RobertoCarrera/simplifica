-- FIX 1: Habilitar RLS en tablas críticas
ALTER TABLE public.gdpr_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifactu_function_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verifactu_invoice_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_stage_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_ticket_sequences ENABLE ROW LEVEL SECURITY;

-- FIX 2: Crear policies de seguridad base para estas tablas

-- GDPR Audit Log: Solo visible por admins y DPO
CREATE POLICY "gdpr_audit_log_admin_access" ON public.gdpr_audit_log
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    LEFT JOIN app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND (u.is_dpo = true OR ar.name IN ('admin', 'super_admin', 'owner'))
  )
);

-- VeriFactu Logs: Solo visible por super admins y soporte técnico
CREATE POLICY "verifactu_logs_admin_access" ON public.verifactu_function_log
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    LEFT JOIN app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND ar.name IN ('super_admin')
  )
);

-- User Modules: Los usuarios pueden ver sus propios módulos activados
CREATE POLICY "user_modules_own_read" ON public.user_modules
FOR SELECT TO authenticated
USING (user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid()));

-- User Modules: Solo admins pueden modificar (escritura)
CREATE POLICY "user_modules_admin_write" ON public.user_modules
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    LEFT JOIN app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND ar.name IN ('super_admin')
  )
);

-- Modules & Catalog: Lectura autenticada, escritura super admin
CREATE POLICY "modules_read_authenticated" ON public.modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "modules_catalog_read_authenticated" ON public.modules_catalog FOR SELECT TO authenticated USING (true);

-- FIX 3: Corregir is_super_admin para no usar ID hardcodeado
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'temp'
AS $$
BEGIN
  -- Verificar por nombre de rol en lugar de ID fijo
  RETURN EXISTS (
    SELECT 1 
    FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE (u.auth_user_id = user_id OR u.id = user_id)
    AND ar.name = 'super_admin'
  );
END;
$$;

-- FIX 4: Endurecer app_settings
-- Eliminar política pública permisiva si existe (asumiendo nombres genéricos o recreando)
DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.app_settings;

-- Crear política de lectura solo para autenticados (más seguro por defecto)
CREATE POLICY "app_settings_read_authenticated" ON public.app_settings
FOR SELECT TO authenticated
USING (true);

-- Crear política de lectura pública SOLO para claves no sensibles (si fuera necesario, aquí un ejemplo opcional, comentado)
-- CREATE POLICY "app_settings_read_public_safe" ON public.app_settings
-- FOR SELECT TO public
-- USING (key IN ('site_name', 'support_email', 'logo_url'));

