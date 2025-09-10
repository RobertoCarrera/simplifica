-- ===================================================================
-- DIAGNÓSTICO COMPLETO RLS - IDENTIFICAR CONFLICTOS
-- ===================================================================
-- Este script ayuda a identificar exactamente qué está causando el error 500

-- PASO 1: VERIFICAR ESTADO ACTUAL DE RLS
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users', 'companies', 'clients', 'services', 'tickets')
ORDER BY tablename;

-- PASO 2: LISTAR TODAS LAS POLÍTICAS ACTUALES
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  permissive,
  roles,
  qual as filter_condition,
  with_check as check_condition
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- PASO 3: VERIFICAR TRIGGERS EN AUTH.USERS (pueden causar problemas)
SELECT 
  trigger_name, 
  event_manipulation, 
  action_timing,
  action_statement,
  action_orientation
FROM information_schema.triggers 
WHERE event_object_schema = 'auth' 
  AND event_object_table = 'users';

-- PASO 4: VERIFICAR SI HAY FUNCIONES PROBLEMÁTICAS
SELECT 
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%user%'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- PASO 5: PROBAR CONSULTA DIRECTA SIN RLS (COMO SUPERUSER)
-- Esta consulta debería funcionar sin problemas
SELECT 
  'Direct query test' as test_type,
  u.id,
  u.auth_user_id,
  u.email,
  u.role,
  u.company_id,
  c.name as company_name
FROM public.users u
LEFT JOIN public.companies c ON u.company_id = c.id
WHERE u.email = 'robertocarreratech@gmail.com'
LIMIT 1;

-- PASO 6: VERIFICAR PERMISOS EN TABLAS
SELECT 
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.table_privileges 
WHERE table_schema = 'public' 
  AND table_name = 'users'
  AND grantee IN ('public', 'authenticated', 'anon');

-- PASO 7: VERIFICAR CONFIGURACIÓN DE AUTH
SELECT 
  name,
  setting,
  context
FROM pg_settings 
WHERE name LIKE '%rls%' OR name LIKE '%auth%'
ORDER BY name;

-- ===================================================================
-- INSTRUCCIONES PARA INTERPRETAR RESULTADOS:
-- 
-- 1. Si RLS está habilitado pero hay políticas duplicadas = CONFLICTO
-- 2. Si hay triggers en auth.users = PROBLEMA DE ACTIVACIÓN
-- 3. Si la consulta directa falla = PROBLEMA DE DATOS
-- 4. Si no hay permisos para 'authenticated' = PROBLEMA DE ACCESO
-- ===================================================================
