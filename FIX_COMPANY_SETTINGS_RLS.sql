-- FIX DEFINITIVO: Dropeamos la función y la recreamos

-- 1. Drop la policy problemática primero
DROP POLICY IF EXISTS "company_settings_write" ON public.company_settings;

-- 2. Drop la función existente
DROP FUNCTION IF EXISTS public.is_company_admin(UUID);

-- 3. Crear la función de nuevo con la lógica correcta
CREATE FUNCTION public.is_company_admin(target_company UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.users u ON cm.user_id = u.id
    LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = target_company
      AND cm.status = 'active'
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
$$;

-- 4. Recrear la policy 
CREATE POLICY "company_settings_write"
ON public.company_settings
FOR ALL
TO authenticated
USING (is_company_admin(company_id))
WITH CHECK (is_company_admin(company_id));

SELECT '✅ Función is_company_admin y policy actualizadas' as result;