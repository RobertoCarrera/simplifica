-- SOLUCIÓN URGENTE: Confirmar usuario manualmente y arreglar permisos
-- Ejecutar en Supabase SQL Editor paso a paso

-- 1. CONFIRMAR EL USUARIO MANUALMENTE (EJECUTA ESTO PRIMERO)
UPDATE auth.users 
SET 
  email_confirmed_at = NOW(), 
  confirmed_at = NOW() 
WHERE email = 'robertocarreratech@gmail.com' 
  AND email_confirmed_at IS NULL;

-- 2. Verificar que el usuario fue confirmado
SELECT 
  email,
  email_confirmed_at,
  confirmed_at,
  created_at
FROM auth.users 
WHERE email = 'robertocarreratech@gmail.com';

-- 3. ARREGLAR PERMISOS: Dar acceso a auth para ver public.companies
-- (Este puede ser el problema de fondo)
GRANT USAGE ON SCHEMA public TO authenticator;
GRANT SELECT ON public.companies TO authenticator;
GRANT SELECT ON public.users TO authenticator;

-- 4. Si tienes triggers en auth.users que referencian public.companies, 
-- asegúrate de que usen SECURITY DEFINER y sean ejecutados por un role con permisos
-- Lista todos los triggers en auth.users para verificar:
SELECT 
  trigger_name, 
  event_manipulation, 
  action_statement,
  action_timing,
  action_orientation
FROM information_schema.triggers 
WHERE event_object_schema = 'auth' 
  AND event_object_table = 'users';

-- 5. Verificar políticas RLS que puedan estar causando problemas
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname IN ('auth', 'public')
  AND tablename IN ('users', 'companies');

-- 6. OPCIONAL: Si hay funciones que se ejecutan durante confirmación,
-- verificar que tienen los permisos correctos
SELECT 
  routine_name,
  routine_type,
  security_type,
  definer_rights
FROM information_schema.routines 
WHERE routine_schema = 'auth' 
  OR routine_body LIKE '%companies%';

-- DESPUÉS DE EJECUTAR EL UPDATE DEL PASO 1:
-- El usuario debería poder hacer login directamente en /auth-debug
