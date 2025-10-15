-- ============================================================================
-- VERIFICAR POLÍTICAS RLS DE CLIENTS
-- ============================================================================
-- Este script verifica que las políticas RLS de clients estén correctas

-- 1. Verificar políticas actuales en clients
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
WHERE tablename = 'clients'
ORDER BY policyname;

-- 2. Verificar si RLS está habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE tablename = 'clients';

-- 3. Test: ¿Puede el usuario actual ver su company_id?
SELECT 
    'Mi auth_user_id' as test,
    auth.uid() as user_id;

SELECT 
    'Mi company_id desde users' as test,
    company_id,
    role
FROM users
WHERE auth_user_id = auth.uid();

SELECT 
    'Mi company_id desde user_company_context' as test,
    auth_user_id,
    company_id,
    role
FROM user_company_context;

-- 4. Test: ¿Cuántos clientes debería ver?
SELECT 
    'Clientes que debería ver' as test,
    COUNT(*) as count
FROM clients
WHERE deleted_at IS NULL
AND company_id IN (SELECT company_id FROM user_company_context);

-- ============================================================================
-- Si ves 0 clientes pero sabes que existen, las políticas RLS están mal
-- ============================================================================
