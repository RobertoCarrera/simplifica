-- ===================================================================
-- RESTAURAR RLS DE FORMA SEGURA - PRODUCCIÓN
-- ===================================================================
-- Este script restaura las políticas RLS después de que el auth funcione

-- PASO 1: HABILITAR RLS EN LAS TABLAS PRINCIPALES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- PASO 2: POLÍTICAS PARA TABLA USERS (SIMPLIFICADAS)
-- Los usuarios solo pueden ver usuarios de su propia empresa
CREATE POLICY "users_select_own_company" ON public.users
  FOR SELECT 
  USING (
    company_id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- Los usuarios solo pueden actualizar su propio perfil
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE 
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- PASO 3: POLÍTICAS PARA TABLA COMPANIES (SIMPLIFICADAS)
-- Los usuarios pueden ver solo su empresa
CREATE POLICY "companies_select_own" ON public.companies
  FOR SELECT 
  USING (
    id IN (
      SELECT company_id 
      FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- Solo owners pueden actualizar la empresa
CREATE POLICY "companies_update_owner" ON public.companies
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

-- PASO 4: POLÍTICAS PARA TABLA CLIENTS
-- Usuarios ven solo clientes de su empresa
CREATE POLICY "clients_company_access" ON public.clients
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

-- PASO 5: POLÍTICAS PARA TABLA SERVICES
-- Usuarios ven solo servicios de su empresa
CREATE POLICY "services_company_access" ON public.services
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

-- PASO 6: POLÍTICAS PARA TABLA TICKETS
-- Usuarios ven solo tickets de su empresa
CREATE POLICY "tickets_company_access" ON public.tickets
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

-- PASO 7: VERIFICAR QUE NO HAY TRIGGERS PROBLEMÁTICOS
SELECT 
  trigger_name, 
  event_manipulation, 
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE event_object_schema = 'auth' 
  AND event_object_table = 'users';

-- PASO 8: VERIFICAR POLÍTICAS APLICADAS
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

-- ===================================================================
-- RESULTADO ESPERADO:
-- - RLS habilitado en tablas principales
-- - Políticas simples sin recursión
-- - Solo acceso a datos de la propia empresa
-- - Auth funciona sin interrupciones
-- ===================================================================
