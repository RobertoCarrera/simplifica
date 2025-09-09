-- ============================================
-- VERIFICAR SISTEMA DE INVITACIONES
-- ============================================

-- 1. Verificar que la tabla companies existe y tiene datos
SELECT 'TABLA COMPANIES:' as info;
SELECT COUNT(*) as total_companies, 
       COUNT(CASE WHEN is_active THEN 1 END) as active_companies
FROM public.companies;

-- 2. Mostrar empresas disponibles
SELECT 'EMPRESAS DISPONIBLES:' as info;
SELECT id, name, slug, is_active FROM public.companies;

-- 3. Verificar RLS en companies
SELECT 'RLS COMPANIES:' as info;
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'companies';

-- 4. Verificar usuarios actuales
SELECT 'USUARIOS ACTUALES:' as info;
SELECT id, email, name, role, active, company_id, auth_user_id 
FROM public.users;

-- 5. Verificar usuarios en auth.users
SELECT 'USUARIOS AUTH:' as info;
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
LIMIT 5;

-- 6. Verificar si existe la función de invitación
SELECT 'FUNCIÓN INVITE_USER_TO_COMPANY:' as info;
SELECT proname, pronargs, prosrc 
FROM pg_proc 
WHERE proname = 'invite_user_to_company';

-- 7. Test de políticas RLS problemáticas
SELECT 'VERIFICAR USER_PROFILES RLS:' as info;
SELECT policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'user_profiles';

-- 8. Verificar políticas RLS en companies
SELECT 'POLÍTICAS RLS COMPANIES:' as info;
SELECT policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE tablename = 'companies';
