-- ===================================================================
-- RLS SEGURO SIN RECURSIÓN - PRODUCCIÓN FINAL
-- ===================================================================
-- Esta vez sin recursión infinite, usando auth.uid() directo

-- PASO 1: HABILITAR RLS EN LAS TABLAS PRINCIPALES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- PASO 2: POLÍTICAS PARA TABLA USERS (SIN RECURSIÓN)
-- Los usuarios pueden ver su propio perfil directamente
CREATE POLICY "users_own_profile" ON public.users
  FOR SELECT 
  USING (auth_user_id = auth.uid());

-- Los usuarios pueden actualizar su propio perfil
CREATE POLICY "users_own_update" ON public.users
  FOR UPDATE 
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- PASO 3: CREAR VISTA PARA EVITAR RECURSIÓN
-- Esta vista nos da el company_id del usuario actual sin recursión
CREATE OR REPLACE VIEW user_company_context AS
SELECT 
  auth.uid() as auth_user_id,
  u.company_id,
  u.role
FROM public.users u
WHERE u.auth_user_id = auth.uid();

-- PASO 4: POLÍTICAS PARA TABLA COMPANIES (USANDO VISTA)
-- Los usuarios pueden ver solo su empresa
CREATE POLICY "companies_own_view" ON public.companies
  FOR SELECT 
  USING (
    id IN (
      SELECT company_id 
      FROM user_company_context
    )
  );

-- Solo owners pueden actualizar la empresa
CREATE POLICY "companies_owner_edit" ON public.companies
  FOR UPDATE 
  USING (
    id IN (
      SELECT company_id 
      FROM user_company_context
      WHERE role = 'owner'
    )
  )
  WITH CHECK (
    id IN (
      SELECT company_id 
      FROM user_company_context
      WHERE role = 'owner'
    )
  );

-- PASO 5: POLÍTICAS PARA TABLA CLIENTS (USANDO VISTA)
CREATE POLICY "clients_company_only" ON public.clients
  FOR ALL 
  USING (
    company_id IN (
      SELECT company_id 
      FROM user_company_context
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id 
      FROM user_company_context
    )
  );

-- PASO 6: POLÍTICAS PARA TABLA SERVICES (USANDO VISTA)
CREATE POLICY "services_company_only" ON public.services
  FOR ALL 
  USING (
    company_id IN (
      SELECT company_id 
      FROM user_company_context
    )
    AND deleted_at IS NULL
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id 
      FROM user_company_context
    )
  );

-- PASO 7: POLÍTICAS PARA TABLA TICKETS (USANDO VISTA)
CREATE POLICY "tickets_company_only" ON public.tickets
  FOR ALL 
  USING (
    company_id IN (
      SELECT company_id 
      FROM user_company_context
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id 
      FROM user_company_context
    )
  );

-- PASO 8: VERIFICAR POLÍTICAS APLICADAS
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'companies', 'clients', 'services', 'tickets')
ORDER BY tablename, policyname;

-- PASO 9: VERIFICAR QUE EL USUARIO PUEDE ACCEDER A SUS DATOS
SELECT 
  'Final test - RLS enabled safely' as test_description,
  u.id,
  u.email,
  u.role,
  c.name as company_name
FROM public.users u
LEFT JOIN public.companies c ON u.company_id = c.id
WHERE u.auth_user_id = auth.uid()
LIMIT 1;

-- PASO 10: VERIFICAR VISTA HELPER
SELECT 
  'User context test' as test_description,
  auth_user_id,
  company_id,
  role
FROM user_company_context;

-- ===================================================================
-- RESULTADO ESPERADO:
-- - RLS habilitado sin recursión
-- - Vista helper evita problemas de referencia circular
-- - Solo acceso a datos de la propia empresa
-- - Role detection funcionando correctamente
-- ===================================================================
