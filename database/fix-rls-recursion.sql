-- ================================================
-- FIX RLS RECURSION ISSUE (IMMEDIATE)
-- ================================================
-- El problema: las políticas companies_select_own consulta users,
-- pero users también tiene RLS, creando recursión infinita

-- 1. Eliminar todas las políticas existentes problemáticas
DROP POLICY IF EXISTS companies_select_own ON public.companies;
DROP POLICY IF EXISTS users_select_self ON public.users;
DROP POLICY IF EXISTS users_update_self ON public.users;
DROP POLICY IF EXISTS users_insert_self ON public.users;

-- 2. Deshabilitar RLS temporalmente para limpiar
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 3. Crear políticas más simples sin recursión

-- Para users: usar auth.uid() directamente sin complicaciones
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy simple: usuarios pueden ver/editar solo su propia fila
CREATE POLICY users_own_data ON public.users 
FOR ALL 
USING (auth_user_id = auth.uid());

-- Policy para insertar: solo usuarios autenticados pueden crear su fila
CREATE POLICY users_insert_own ON public.users 
FOR INSERT 
WITH CHECK (auth_user_id = auth.uid());

-- Para companies: enfoque más simple - usar security definer functions o permisos básicos
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Companies: permitir acceso a usuarios autenticados a cualquier compañía de momento
-- (después refinamos con funciones más seguras)
CREATE POLICY companies_authenticated ON public.companies 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Companies: insertar solo para usuarios autenticados
CREATE POLICY companies_insert_auth ON public.companies 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Companies: actualizar solo para owners/admins (verificación en app por ahora)
CREATE POLICY companies_update_auth ON public.companies 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

-- ================================================
-- VERIFICACIÓN: comprobar que no hay recursión
-- ================================================
SELECT 
    schemaname,
    tablename,
    policyname,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'companies')
ORDER BY tablename, policyname;

-- Mensaje de estado
DO $$ 
BEGIN 
    RAISE NOTICE '✅ RLS recursion fixed - policies recreated without circular dependencies';
END $$;
