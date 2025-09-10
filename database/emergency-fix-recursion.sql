-- ===================================================================
-- SOLUCIÓN URGENTE: ELIMINAR RECURSIÓN INFINITA
-- ===================================================================
-- Los logs muestran: "infinite recursion detected in policy for relation users"

-- PASO 1: DESHABILITAR RLS COMPLETAMENTE (URGENTE)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.services DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets DISABLE ROW LEVEL SECURITY;

-- PASO 2: ELIMINAR TODAS LAS POLÍTICAS PROBLEMÁTICAS
DROP POLICY IF EXISTS "users_company_access" ON public.users;
DROP POLICY IF EXISTS "users_self_update" ON public.users;
DROP POLICY IF EXISTS "users_select_company" ON public.users;
DROP POLICY IF EXISTS "users_select_own_company" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;

DROP POLICY IF EXISTS "companies_own_access" ON public.companies;
DROP POLICY IF EXISTS "companies_owner_update" ON public.companies;
DROP POLICY IF EXISTS "companies_select_own" ON public.companies;
DROP POLICY IF EXISTS "companies_update_owner" ON public.companies;

DROP POLICY IF EXISTS "clients_company_scope" ON public.clients;
DROP POLICY IF EXISTS "clients_company_access" ON public.clients;

DROP POLICY IF EXISTS "services_company_scope" ON public.services;
DROP POLICY IF EXISTS "services_company_access" ON public.services;

DROP POLICY IF EXISTS "tickets_company_scope" ON public.tickets;
DROP POLICY IF EXISTS "tickets_company_access" ON public.tickets;

-- PASO 3: VERIFICAR QUE NO QUEDAN POLÍTICAS
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'companies', 'clients', 'services', 'tickets')
ORDER BY tablename, policyname;

-- PASO 4: VERIFICAR ESTADO DE RLS
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'companies', 'clients', 'services', 'tickets')
ORDER BY tablename;

-- PASO 5: TEST DE FUNCIONAMIENTO
SELECT 
  'Emergency test - should work now' as test_description,
  u.id,
  u.email,
  u.role,
  c.name as company_name
FROM public.users u
LEFT JOIN public.companies c ON u.company_id = c.id
WHERE u.email = 'robertocarreratech@gmail.com'
LIMIT 1;

-- ===================================================================
-- ESTO DEBE EJECUTARSE INMEDIATAMENTE PARA SOLUCIONAR EL ERROR 500
-- ===================================================================
