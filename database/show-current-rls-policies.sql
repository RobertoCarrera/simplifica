-- ============================================================================
-- Ver políticas RLS actuales de clients, services y tickets
-- ============================================================================

-- 1. Políticas de CLIENTS
SELECT 
    'CLIENTS - ' || policyname as policy,
    cmd as operation,
    roles::text[] as roles,
    qual as using_clause,
    with_check as with_check_clause
FROM pg_policies
WHERE tablename = 'clients'
ORDER BY cmd, policyname;

-- 2. Políticas de SERVICES
SELECT 
    'SERVICES - ' || policyname as policy,
    cmd as operation,
    roles::text[] as roles,
    qual as using_clause,
    with_check as with_check_clause
FROM pg_policies
WHERE tablename = 'services'
ORDER BY cmd, policyname;

-- 3. Políticas de TICKETS
SELECT 
    'TICKETS - ' || policyname as policy,
    cmd as operation,
    roles::text[] as roles,
    qual as using_clause,
    with_check as with_check_clause
FROM pg_policies
WHERE tablename = 'tickets'
ORDER BY cmd, policyname;

-- 4. Ver definición actual de user_company_context
SELECT 
    'Vista user_company_context' as info,
    pg_get_viewdef('user_company_context'::regclass, true) as definition;

-- ============================================================================
-- COPIA TODOS LOS RESULTADOS
-- ============================================================================
