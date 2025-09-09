-- Diagnóstico del usuario con problemas de confirmación
-- Ejecutar en Supabase SQL Editor

-- 1. Verificar estado del usuario en auth.users
SELECT 
  id,
  email,
  email_confirmed_at,
  phone_confirmed_at,
  confirmed_at,
  created_at,
  updated_at,
  last_sign_in_at,
  raw_user_meta_data,
  is_sso_user,
  deleted_at
FROM auth.users 
WHERE email = 'robertocarreratech@gmail.com';

-- 2. Verificar usuario en public.users
SELECT 
  u.id,
  u.auth_user_id,
  u.email,
  u.name,
  u.role,
  u.active,
  u.company_id,
  u.created_at,
  c.name as company_name,
  c.is_active as company_active
FROM public.users u
LEFT JOIN public.companies c ON u.company_id = c.id
WHERE u.email = 'robertocarreratech@gmail.com';

-- 3. Verificar empresa asociada
SELECT 
  id,
  name,
  slug,
  is_active,
  created_at,
  settings,
  subscription_tier,
  max_users
FROM public.companies 
WHERE id = (
  SELECT company_id FROM public.users WHERE email = 'robertocarreratech@gmail.com'
);

-- 4. SOLUCIÓN: Si el usuario existe pero no está confirmado, confirmarlo manualmente
-- SOLO EJECUTAR SI LA CONSULTA 1 MUESTRA email_confirmed_at = NULL

-- DESCOMENTAR LA SIGUIENTE LÍNEA SOLO SI ES NECESARIO:
-- UPDATE auth.users SET email_confirmed_at = NOW(), confirmed_at = NOW() WHERE email = 'robertocarreratech@gmail.com' AND email_confirmed_at IS NULL;

-- 5. Verificar que no hay duplicados
SELECT email, COUNT(*) as count
FROM auth.users 
WHERE email = 'robertocarreratech@gmail.com'
GROUP BY email;

-- 6. Ver últimos logs de auth (si están disponibles)
SELECT 
  created_at,
  level,
  msg,
  metadata
FROM auth.audit_log_entries 
WHERE (metadata->>'email')::text = 'robertocarreratech@gmail.com'
ORDER BY created_at DESC 
LIMIT 10;
