-- DIAGNÓSTICO: Verificar datos de Roberto en la base de datos
-- Ejecuta esto en Supabase Dashboard > SQL Editor

-- 1. Verificar si existe en auth.users
SELECT 'AUTH USERS' as tabla, id, email, created_at
FROM auth.users 
WHERE email = 'robertocarreratech@gmail.com';

-- 2. Verificar si existe en public.users
SELECT 'PUBLIC USERS' as tabla, 
  id, 
  auth_user_id, 
  email, 
  name, 
  app_role_id,
  company_id,
  active
FROM public.users 
WHERE email = 'robertocarreratech@gmail.com';

-- 3. Verificar membresías en company_members
SELECT 'COMPANY MEMBERS' as tabla,
  cm.id,
  cm.user_id,
  cm.company_id,
  cm.role_id,
  cm.role as legacy_role,
  cm.status,
  ar.name as role_name,
  c.name as company_name
FROM public.company_members cm
LEFT JOIN public.app_roles ar ON cm.role_id = ar.id
LEFT JOIN public.companies c ON cm.company_id = c.id
WHERE cm.user_id IN (
  SELECT id FROM public.users WHERE email = 'robertocarreratech@gmail.com'
);

-- 4. Verificar si existe en clients (portal de cliente)
SELECT 'CLIENTS' as tabla, id, auth_user_id, email, name, company_id, is_active
FROM public.clients 
WHERE email = 'robertocarreratech@gmail.com';

-- 5. Verificar todas las empresas existentes
SELECT 'COMPANIES' as tabla, id, name, slug, is_active
FROM public.companies;

-- 6. Verificar roles disponibles
SELECT 'APP ROLES' as tabla, id, name, label
FROM public.app_roles;
