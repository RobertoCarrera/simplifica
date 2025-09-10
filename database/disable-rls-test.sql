-- ===================================================================
-- DIAGNÓSTICO TEMPORAL: DESHABILITAR RLS
-- ===================================================================
-- Este script deshabilita RLS temporalmente para aislar el problema

-- PASO 1: DESHABILITAR RLS EN TODAS LAS TABLAS
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.services DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets DISABLE ROW LEVEL SECURITY;

-- PASO 2: VERIFICAR ESTADO
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'companies', 'clients', 'services', 'tickets')
ORDER BY tablename;

-- PASO 3: PROBAR CONSULTA SIMPLE
SELECT 
  'Test query without RLS' as test_description,
  u.id,
  u.email,
  u.role,
  c.name as company_name
FROM public.users u
LEFT JOIN public.companies c ON u.company_id = c.id
WHERE u.email = 'robertocarreratech@gmail.com'
LIMIT 1;

-- ===================================================================
-- RESULTADO ESPERADO:
-- - RLS deshabilitado en todas las tablas
-- - Consulta funciona sin errores
-- - Si el error 500 persiste, NO es problema de RLS
-- ===================================================================
