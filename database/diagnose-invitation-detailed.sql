-- ============================================
-- DIAGNÓSTICO DETALLADO DE INVITACIÓN
-- ============================================

-- 1. Verificar contexto de autenticación
SELECT 'CONTEXTO AUTH:' as info;
SELECT 
    auth.uid() as current_auth_uid,
    auth.role() as current_auth_role,
    current_user as current_db_user;

-- 2. Buscar usuario actual en public.users
SELECT 'BUSCAR USUARIO ACTUAL:' as info;
SELECT 
    id, email, name, role, active, company_id, auth_user_id
FROM public.users 
WHERE auth_user_id = auth.uid()
   OR email = 'puchu.carrera@gmail.com';

-- 3. Verificar si hay algún usuario en users
SELECT 'TODOS LOS USUARIOS:' as info;
SELECT count(*) as total_users, 
       count(CASE WHEN auth_user_id IS NOT NULL THEN 1 END) as users_with_auth
FROM public.users;

-- 4. Verificar empresas disponibles
SELECT 'EMPRESAS DISPONIBLES:' as info;
SELECT id, name, slug, is_active FROM public.companies LIMIT 3;

-- 5. Test manual de creación de usuario (sin función)
INSERT INTO public.users (
    company_id,
    email,
    name,
    role,
    active,
    permissions
) 
SELECT 
    c.id,
    'test.manual@ejemplo.com',
    'Usuario Manual Test',
    'member',
    true,
    '{"moduloFacturas": false, "moduloMaterial": false, "moduloServicios": false, "moduloPresupuestos": false}'::jsonb
FROM public.companies c 
WHERE c.is_active = true 
LIMIT 1
ON CONFLICT (email) DO NOTHING;

-- 6. Verificar si se creó
SELECT 'USUARIO MANUAL CREADO:' as info;
SELECT email, name, role, company_id 
FROM public.users 
WHERE email = 'test.manual@ejemplo.com';
