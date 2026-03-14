-- Función para verificar si un usuario es SuperAdmin de forma segura en el servidor
CREATE OR REPLACE FUNCTION public.is_super_admin_real()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND (ar.name = 'super_admin' OR u.role = 'super_admin')
    AND u.active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_super_admin_real() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin_real() TO service_role;
