-- ========================================
-- DIAGNÓSTICO COMPLETO DE RLS Y AUTENTICACIÓN
-- ========================================

-- 1. Verificar políticas actuales
SELECT 
    schemaname,
    tablename, 
    policyname, 
    cmd,
    permissive,
    roles,
    substring(qual, 1, 100) as using_clause,
    substring(with_check, 1, 100) as with_check_clause
FROM pg_policies 
WHERE tablename IN ('companies', 'users')
ORDER BY tablename, cmd, policyname;

-- 2. Verificar RLS habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('companies', 'users') AND schemaname = 'public';

-- 3. Verificar estructura de tablas
\d+ public.companies;
\d+ public.users;

-- 4. Test de autenticación actual (esto fallará si no hay usuario autenticado)
SELECT 
    auth.uid() as current_auth_user_id,
    current_setting('request.jwt.claim.sub', true) as jwt_sub;

-- 5. Verificar usuarios existentes
SELECT 
    id,
    email,
    name,
    role,
    company_id,
    auth_user_id,
    active,
    created_at
FROM public.users
ORDER BY created_at DESC
LIMIT 5;

-- 6. Verificar empresas existentes
SELECT 
    id,
    name,
    slug,
    is_active,
    created_at
FROM public.companies
ORDER BY created_at DESC
LIMIT 5;
