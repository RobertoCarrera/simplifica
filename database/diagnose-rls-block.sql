-- ============================================================================
-- DIAGNÓSTICO COMPLETO: ¿Por qué RLS bloquea todo?
-- ============================================================================

-- 1. ¿Quién soy yo?
SELECT 
    'Mi usuario autenticado' as test,
    auth.uid() as auth_user_id;

-- 2. ¿Tengo registro en tabla users?
SELECT 
    'Mi registro en users' as test,
    id,
    email,
    name,
    surname,
    company_id,
    role,
    auth_user_id,
    active,
    deleted_at
FROM users
WHERE auth_user_id = auth.uid();

-- 3. ¿Qué devuelve user_company_context?
SELECT 
    'Vista user_company_context' as test,
    auth_user_id,
    company_id,
    role
FROM user_company_context;

-- 4. ¿Cuál es la definición actual de user_company_context?
SELECT 
    'Definición de user_company_context' as test,
    pg_get_viewdef('user_company_context'::regclass, true) as definition;

-- 5. Test directo: ¿Puedo ver clientes sin filtro company_id?
SELECT 
    'Total clientes en DB (SIN filtro RLS)' as test,
    COUNT(*) as total
FROM clients;

-- 6. Test: ¿Qué devuelve la subquery de las políticas RLS?
SELECT 
    'Subquery de políticas RLS' as test,
    company_id
FROM user_company_context;

-- 7. Ver TODAS las políticas RLS de clients
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual as using_expression,
    with_check as check_expression
FROM pg_policies
WHERE tablename = 'clients'
ORDER BY cmd, policyname;

-- 8. Test crítico: ¿La vista user_company_context devuelve NULL?
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM user_company_context WHERE company_id IS NOT NULL)
        THEN 'OK: user_company_context devuelve company_id'
        ELSE 'ERROR: user_company_context devuelve NULL o vacío'
    END as diagnostic;

-- 9. Ver si auth.uid() funciona
SELECT 
    CASE 
        WHEN auth.uid() IS NULL 
        THEN 'ERROR: auth.uid() es NULL (no autenticado)'
        ELSE 'OK: auth.uid() = ' || auth.uid()::text
    END as auth_check;

-- 10. Verificar si el usuario está activo
SELECT 
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid())
        THEN 'ERROR: No existe registro en users para este auth.uid()'
        WHEN EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND active = false)
        THEN 'ERROR: Usuario existe pero está INACTIVO'
        WHEN EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND deleted_at IS NOT NULL)
        THEN 'ERROR: Usuario existe pero está ELIMINADO'
        WHEN EXISTS (SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND company_id IS NULL)
        THEN 'ERROR: Usuario existe pero company_id es NULL'
        ELSE 'OK: Usuario existe, activo y con company_id'
    END as user_status;

-- ============================================================================
-- COPIA TODOS LOS RESULTADOS Y ENVÍAMELOS
-- ============================================================================
