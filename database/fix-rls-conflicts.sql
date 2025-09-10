-- ===================================================================
-- LIMPIEZA COMPLETA Y RESTAURACIÓN RLS - PRODUCCIÓN
-- ===================================================================
-- Este script limpia políticas conflictivas y restaura RLS correctamente

-- PASO 1: DESHABILITAR RLS TEMPORALMENTE
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.services DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets DISABLE ROW LEVEL SECURITY;

-- PASO 2: ELIMINAR TODAS LAS POLÍTICAS EXISTENTES QUE PUEDAN ESTAR EN CONFLICTO
DROP POLICY IF EXISTS "users_select_company" ON public.users;
DROP POLICY IF EXISTS "users_select_own_company" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;

DROP POLICY IF EXISTS "companies_select_own" ON public.companies;
DROP POLICY IF EXISTS "companies_update_owner" ON public.companies;

DROP POLICY IF EXISTS "clients_company_access" ON public.clients;
DROP POLICY IF EXISTS "services_company_access" ON public.services;
DROP POLICY IF EXISTS "tickets_company_access" ON public.tickets;

-- PASO 3: VERIFICAR QUE NO HAY TRIGGERS PROBLEMÁTICOS EN AUTH.USERS
SELECT 
  trigger_name, 
  event_manipulation, 
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE event_object_schema = 'auth' 
  AND event_object_table = 'users';

-- PASO 4: HABILITAR RLS EN LAS TABLAS PRINCIPALES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- PASO 5: CREAR POLÍTICAS LIMPIAS PARA TABLA USERS
-- Los usuarios pueden ver usuarios de su propia empresa
CREATE POLICY "users_company_access" ON public.users
  FOR SELECT 
  USING (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- Los usuarios pueden actualizar su propio perfil
CREATE POLICY "users_self_update" ON public.users
  FOR UPDATE 
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- PASO 6: CREAR POLÍTICAS LIMPIAS PARA TABLA COMPANIES
-- Los usuarios pueden ver solo su empresa
CREATE POLICY "companies_own_access" ON public.companies
  FOR SELECT 
  USING (
    id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- Solo owners pueden actualizar la empresa
CREATE POLICY "companies_owner_update" ON public.companies
  FOR UPDATE 
  USING (
    id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'owner'
    )
  )
  WITH CHECK (
    id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid() 
      AND role = 'owner'
    )
  );

-- PASO 7: CREAR POLÍTICAS LIMPIAS PARA TABLA CLIENTS
-- Usuarios ven solo clientes de su empresa
CREATE POLICY "clients_company_scope" ON public.clients
  FOR ALL 
  USING (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- PASO 8: CREAR POLÍTICAS LIMPIAS PARA TABLA SERVICES
-- Usuarios ven solo servicios de su empresa
CREATE POLICY "services_company_scope" ON public.services
  FOR ALL 
  USING (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- PASO 9: CREAR POLÍTICAS LIMPIAS PARA TABLA TICKETS
-- Usuarios ven solo tickets de su empresa
CREATE POLICY "tickets_company_scope" ON public.tickets
  FOR ALL 
  USING (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- PASO 10: VERIFICAR ESTADO FINAL
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  permissive
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'companies', 'clients', 'services', 'tickets')
ORDER BY tablename, policyname;

-- PASO 11: VERIFICAR QUE EL USUARIO PUEDE ACCEDER A SUS DATOS
SELECT 
  'Test query - should return current user data' as test_description,
  u.id,
  u.email,
  u.role,
  c.name as company_name
FROM public.users u
LEFT JOIN public.companies c ON u.company_id = c.id
WHERE u.auth_user_id = auth.uid()
LIMIT 1;

-- ===================================================================
-- RESULTADO ESPERADO:
-- - Políticas conflictivas eliminadas
-- - RLS habilitado con políticas limpias
-- - Solo acceso a datos de la propia empresa
-- - Usuario puede acceder a sus datos sin errores 500
-- ===================================================================
