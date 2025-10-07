-- ================================================================
-- VERIFICACIÓN DE RLS - DIAGNÓSTICO COMPLETO
-- ================================================================
-- Fecha: 2025-10-07
-- Objetivo: Identificar EXACTAMENTE qué tablas faltan proteger
-- ================================================================

-- ================================================================
-- QUERY 1: Tablas BASE sin RLS (CRÍTICO - deben ser CERO)
-- ================================================================
SELECT 
    'TABLAS BASE SIN RLS' AS categoria,
    tablename,
    table_type
FROM information_schema.tables t
LEFT JOIN pg_tables pt ON pt.tablename = t.table_name AND pt.schemaname = t.table_schema
WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND (pt.rowsecurity = false OR pt.rowsecurity IS NULL)
    AND t.table_name NOT LIKE 'pg_%'
    AND t.table_name NOT LIKE 'sql_%'
ORDER BY tablename;

-- ================================================================
-- QUERY 2: Vistas sin RLS (NORMAL - las vistas heredan de tablas)
-- ================================================================
SELECT 
    'VISTAS SIN RLS (OK)' AS categoria,
    table_name AS tablename,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_type = 'VIEW'
    AND table_name NOT LIKE 'pg_%'
ORDER BY table_name;

-- ================================================================
-- QUERY 3: Tablas CON RLS y cuántas políticas tienen
-- ================================================================
SELECT 
    'TABLAS PROTEGIDAS' AS categoria,
    pt.tablename,
    pt.rowsecurity AS rls_enabled,
    COUNT(pp.policyname) AS num_policies
FROM pg_tables pt
LEFT JOIN pg_policies pp ON pp.schemaname = pt.schemaname AND pp.tablename = pt.tablename
WHERE pt.schemaname = 'public'
    AND pt.rowsecurity = true
    AND pt.tablename NOT LIKE 'pg_%'
GROUP BY pt.tablename, pt.rowsecurity
ORDER BY num_policies DESC, pt.tablename;

-- ================================================================
-- QUERY 4: Resumen ejecutivo
-- ================================================================
WITH tabla_counts AS (
    SELECT 
        COUNT(*) FILTER (WHERE table_type = 'BASE TABLE') AS total_tablas,
        COUNT(*) FILTER (WHERE table_type = 'VIEW') AS total_vistas
    FROM information_schema.tables
    WHERE table_schema = 'public'
        AND table_name NOT LIKE 'pg_%'
),
rls_counts AS (
    SELECT 
        COUNT(*) FILTER (WHERE rowsecurity = true) AS tablas_con_rls,
        COUNT(*) FILTER (WHERE rowsecurity = false) AS tablas_sin_rls
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
)
SELECT 
    'RESUMEN' AS categoria,
    tc.total_tablas,
    tc.total_vistas,
    rc.tablas_con_rls,
    rc.tablas_sin_rls,
    CASE 
        WHEN rc.tablas_sin_rls = 0 THEN '✅ TODAS LAS TABLAS PROTEGIDAS'
        ELSE '❌ FALTAN ' || rc.tablas_sin_rls || ' TABLAS POR PROTEGER'
    END AS estado
FROM tabla_counts tc, rls_counts rc;

-- ================================================================
-- QUERY 5: Verificar función get_user_company_id()
-- ================================================================
SELECT 
    'FUNCIÓN HELPER' AS categoria,
    routine_name,
    routine_type,
    security_type,
    data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name = 'get_user_company_id';

-- ================================================================
-- QUERY 6: Políticas creadas por tabla
-- ================================================================
SELECT 
    'POLÍTICAS POR TABLA' AS categoria,
    tablename,
    COUNT(*) AS num_policies,
    string_agg(policyname, ', ' ORDER BY policyname) AS policy_names
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY num_policies DESC, tablename;
