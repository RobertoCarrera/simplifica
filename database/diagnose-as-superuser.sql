-- ============================================================================
-- DIAGNÓSTICO COMO SUPERUSER (ejecutar en SQL Editor de Supabase)
-- ============================================================================
-- Este script NO usa auth.uid() - verifica el estado real de la DB

-- 1. Ver definición actual de user_company_context
SELECT 
    'Definición user_company_context' as test,
    pg_get_viewdef('user_company_context'::regclass, true) as definition;

-- 2. Test: ¿Qué devolvería user_company_context para Roberto?
SELECT 
    'Simulación user_company_context para Roberto' as test,
    '84efaa41-9734-4410-b0f2-9101e225ce0c'::uuid as auth_user_id,
    u.company_id,
    u.role
FROM public.users u
WHERE u.auth_user_id = '84efaa41-9734-4410-b0f2-9101e225ce0c'::uuid;

-- 3. Ver TODAS las políticas RLS de clients
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles::text[],
    cmd,
    substring(qual, 1, 200) as using_expression_preview,
    substring(with_check, 1, 200) as check_expression_preview
FROM pg_policies
WHERE tablename = 'clients'
ORDER BY cmd, policyname;

-- 4. Verificar si RLS está habilitado en clients
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'clients';

-- 5. Test: ¿Cuántos clientes hay para la company de Roberto?
SELECT 
    'Clientes de Roberto (company cd830f43...)' as test,
    COUNT(*) as total_clientes
FROM clients
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
AND deleted_at IS NULL;

-- 6. Ver usuarios activos con sus companies
SELECT 
    'Usuarios activos' as test,
    u.id,
    u.email,
    u.name,
    u.surname,
    u.auth_user_id,
    u.company_id,
    c.name as company_name,
    u.role,
    u.active
FROM users u
LEFT JOIN companies c ON u.company_id = c.id
WHERE u.deleted_at IS NULL
AND u.active = true
ORDER BY u.email;

-- 7. Test CRÍTICO: ¿La vista funciona para algún usuario?
SELECT 
    'Test vista con usuarios reales' as test,
    auth_user_id,
    company_id,
    role
FROM (
    SELECT 
        u.auth_user_id,
        u.company_id,
        u.role
    FROM public.users u
    WHERE u.auth_user_id IS NOT NULL
    LIMIT 5
) as simulated_context;

-- ============================================================================
-- COPIA TODOS LOS RESULTADOS
-- ============================================================================
