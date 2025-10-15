-- ============================================================================
-- MOSTRAR POLÍTICAS RLS EXACTAS
-- ============================================================================

-- Ver TODAS las políticas de clients con detalles completos
SELECT 
    policyname,
    cmd as operation,
    permissive,
    roles::text[] as applies_to_roles,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'clients'
ORDER BY cmd, policyname;

-- Ver si hay políticas RESTRICTIVE (que bloquean TODO)
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'clients' 
            AND permissive = 'RESTRICTIVE'
        )
        THEN 'PROBLEMA: Hay políticas RESTRICTIVE que bloquean todo'
        ELSE 'OK: No hay políticas RESTRICTIVE'
    END as restrictive_check;

-- Contar políticas por operación
SELECT 
    cmd as operation,
    COUNT(*) as policy_count,
    array_agg(policyname) as policy_names
FROM pg_policies
WHERE tablename = 'clients'
GROUP BY cmd
ORDER BY cmd;

-- ============================================================================
-- COPIA TODO EL RESULTADO
-- ============================================================================
