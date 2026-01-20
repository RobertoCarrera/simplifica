-- 20260129180000_enforce_module_licenses_rls.sql

-- MIGRACIÓN DE SEGURIDAD: ENFORCEMENT DE LICENCIAS
-- Objetivo: Asegurar que las tablas de módulos específicos (HR, CRM, Facturación) 
-- solo sean accesibles si la empresa tiene el módulo activo ('company_modules').

-- 1. Helper Function: Verificación eficiente de módulo
CREATE OR REPLACE FUNCTION public.company_has_module(p_company_id uuid, p_module_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_modules
    WHERE company_id = p_company_id
      AND module_key = p_module_key
      AND status = 'active'
  );
$$;

-- 2. Proteger Módulo RRHH (Employees)
-- Asumimos que la tabla 'employees' es el núcleo de HR.
-- Mantenemos la lógica de pertenencia a empresa, pero añadimos el check de licencia.

-- Política de Lectura (Select)
DROP POLICY IF EXISTS "employees_select_policy" ON public.employees;
CREATE POLICY "employees_select_policy_licensed" ON public.employees
FOR SELECT TO authenticated
USING (
  -- Check estándar de membresía
  (company_id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND status = 'active'
  ))
  AND
  -- Check de Licencia 'hr'
  public.company_has_module(company_id, 'hr')
);

-- Política de Escritura (Insert/Update/Delete) - Solo Admins/Owners CON licencia
DROP POLICY IF EXISTS "employees_all_policy_admin" ON public.employees;
CREATE POLICY "employees_write_policy_licensed" ON public.employees
FOR ALL TO authenticated
USING (
  -- Check de Admin/Owner
  (EXISTS (
      SELECT 1 FROM public.company_members cm
      LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = employees.company_id
        AND cm.status = 'active'
        AND (cm.role = 'owner' OR ar.name IN ('admin', 'owner'))
  ))
  AND
  -- Check de Licencia 'hr'
  public.company_has_module(company_id, 'hr')
)
WITH CHECK (
  -- Check de Admin/Owner
  (EXISTS (
      SELECT 1 FROM public.company_members cm
      LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
      WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.company_id = employees.company_id
        AND cm.status = 'active'
        AND (cm.role = 'owner' OR ar.name IN ('admin', 'owner'))
  ))
  AND
  -- Check de Licencia 'hr'
  public.company_has_module(company_id, 'hr')
);


-- 3. Proteger Módulo Marketing (Campaigns)
DROP POLICY IF EXISTS "Enable all for company members" ON public.marketing_campaigns;

CREATE POLICY "marketing_campaigns_licensed" ON public.marketing_campaigns
FOR ALL TO authenticated
USING (
  (company_id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND status = 'active'
  ))
  AND
  public.company_has_module(company_id, 'marketing')
)
WITH CHECK (
  (company_id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND status = 'active'
  ))
  AND
  public.company_has_module(company_id, 'marketing')
);

-- NOTA: El módulo de Facturación ('invoices') suele ser "core" en muchos CRMs, 
-- por lo que restringirlo podría romper funcionalidades básicas si no está bien definido 
-- qué es "Facturación Premium" vs "Facturación Básica". 
-- Por ahora protegemos HR y Marketing que son claramente opcionales.
