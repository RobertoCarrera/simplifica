-- ===================================================================
-- SOLUCIÓN SIMPLE Y SEGURA: Eliminar trigger problemático
-- ===================================================================
-- Basado en el esquema real de la base de datos

-- PASO 1: ELIMINAR TRIGGERS Y FUNCIONES PROBLEMÁTICAS
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Otros posibles triggers problemáticos
DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
DROP FUNCTION IF EXISTS public.handle_auth_user_signup() CASCADE;

-- PASO 2: VERIFICAR QUE NO HAY MÁS TRIGGERS EN auth.users
SELECT 
  trigger_name, 
  event_manipulation, 
  action_timing,
  action_statement
FROM information_schema.triggers 
WHERE event_object_schema = 'auth' 
  AND event_object_table = 'users';

-- PASO 3: CONFIRMAR EL USUARIO MANUALMENTE
-- Solo actualizar email_confirmed_at, confirmed_at es columna generada
UPDATE auth.users 
SET email_confirmed_at = NOW()
WHERE email = 'robertocarreratech@gmail.com' 
  AND email_confirmed_at IS NULL;

-- PASO 4: VERIFICAR QUE EL USUARIO FUE CONFIRMADO
SELECT 
  email,
  email_confirmed_at,
  confirmed_at,
  created_at
FROM auth.users 
WHERE email = 'robertocarreratech@gmail.com';

-- PASO 5: VERIFICAR ESTADO EN public.users Y public.companies
SELECT 
  u.id,
  u.auth_user_id,
  u.email,
  u.name,
  u.role,
  u.company_id,
  c.name as company_name
FROM public.users u
LEFT JOIN public.companies c ON u.company_id = c.id
WHERE u.email = 'robertocarreratech@gmail.com';

-- ===================================================================
-- RESULTADO ESPERADO:
-- - No más triggers en auth.users que causen errores
-- - Usuario confirmado manualmente
-- - Proceso de confirmación funcionará para futuros usuarios
-- - La app maneja correctamente la creación de usuarios/empresas
-- ===================================================================
