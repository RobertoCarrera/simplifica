-- ============================================================================
-- DIAGNÓSTICO POST-FIX (ejecutar solo si todavía no funciona)
-- ============================================================================

-- 1. Verificar definición de user_company_context
SELECT 
    'Definición actualizada' as test,
    pg_get_viewdef('user_company_context'::regclass, true) as definition;

-- 2. Verificar que RLS está habilitado
SELECT 
    'Estado RLS' as test,
    tablename,
    rowsecurity
FROM pg_tables
WHERE tablename IN ('clients', 'services', 'tickets')
ORDER BY tablename;

-- 3. Ver políticas RLS de clients
SELECT 
    'Política: ' || policyname as policy_name,
    cmd as operation,
    permissive,
    roles::text[],
    substring(qual, 1, 500) as using_clause
FROM pg_policies
WHERE tablename = 'clients'
ORDER BY cmd, policyname;

-- 4. Test: ¿Las políticas permiten SELECT?
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'clients' 
            AND cmd = 'SELECT'
            AND '{authenticated}' && roles::text[]
        )
        THEN 'OK: Existe política SELECT para authenticated'
        ELSE 'ERROR: No existe política SELECT para authenticated'
    END as select_policy_check;

-- 5. Test: ¿Las políticas permiten INSERT?
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'clients' 
            AND cmd = 'INSERT'
            AND '{authenticated}' && roles::text[]
        )
        THEN 'OK: Existe política INSERT para authenticated'
        ELSE 'ERROR: No existe política INSERT para authenticated'
    END as insert_policy_check;

-- ============================================================================
-- Si ves errores, copia todos los resultados y envíamelos
-- ============================================================================
