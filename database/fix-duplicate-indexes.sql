-- ============================================================================
-- FIX DUPLICATE INDEXES - OPTIMIZACIÓN DE BASE DE DATOS
-- ============================================================================
-- Fecha: 2025-10-07
-- Propósito: Eliminar índices duplicados que desperdician espacio y afectan rendimiento
-- Impacto: Mejora rendimiento de escrituras, reduce tamaño de base de datos
-- Riesgo: BAJO (los índices duplicados son redundantes)
-- Estado: ✅ LOS ÍNDICES DUPLICADOS YA NO EXISTEN EN LA BASE DE DATOS
-- ============================================================================

-- VERIFICACIÓN: Los siguientes índices duplicados YA FUERON ELIMINADOS
-- ============================================================================
-- ✅ idx_services_active - NO EXISTE (correcto)
-- ✅ idx_ticket_tag_relations_unique - NO EXISTE (correcto)
-- ✅ idx_ticket_tags_name_unique_idx - NO EXISTE (correcto)
--
-- CONCLUSIÓN: Este script NO es necesario ejecutar.
-- Los 3 warnings de "duplicate_index" probablemente fueron corregidos previamente.
-- ============================================================================

-- IMPORTANTE: NO EJECUTAR ESTE SCRIPT
-- ============================================================================
-- Los índices duplicados ya no existen en tu base de datos.
-- Si ejecutas los DROP INDEX a continuación, no tendrán efecto (IF EXISTS).
-- Pero este archivo se mantiene solo como documentación histórica.
-- ============================================================================

/*
-- PASO 1: Eliminar índice duplicado en tabla services (YA NO EXISTE)
-- ============================================================================
DROP INDEX IF EXISTS public.idx_services_active;
-- Mantiene: idx_services_is_active (nombre más descriptivo)

-- PASO 2: Eliminar índice duplicado en tabla ticket_tag_relations (YA NO EXISTE)
-- ============================================================================
DROP INDEX IF EXISTS public.idx_ticket_tag_relations_unique;
-- Mantiene: ticket_tag_relations_pkey (PRIMARY KEY tiene mejor rendimiento)

-- PASO 3: Eliminar índice duplicado en tabla ticket_tags (YA NO EXISTE)
-- ============================================================================
DROP INDEX IF EXISTS public.ticket_tags_name_unique_idx;
-- Mantiene: ticket_tags_name_key (UNIQUE constraint generado automáticamente)
*/

-- ============================================================================
-- VERIFICACIÓN POST-ELIMINACIÓN
-- ============================================================================
-- Ejecuta esta query para confirmar que los índices duplicados fueron eliminados:
/*
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('services', 'ticket_tag_relations', 'ticket_tags')
ORDER BY tablename, indexname;
*/

-- ============================================================================
-- RESULTADO ESPERADO
-- ============================================================================
-- services: Solo debe aparecer idx_services_is_active
-- ticket_tag_relations: Solo debe aparecer ticket_tag_relations_pkey
-- ticket_tags: Solo debe aparecer ticket_tags_name_key
-- ============================================================================

-- ============================================================================
-- IMPACTO POSITIVO
-- ============================================================================
-- ✅ Reduce tamaño de base de datos (elimina índices redundantes)
-- ✅ Mejora rendimiento de INSERT/UPDATE/DELETE (menos índices que mantener)
-- ✅ Reduce consumo de memoria en cache de PostgreSQL
-- ✅ Sin impacto negativo en queries (índices redundantes no mejoran rendimiento)
-- ============================================================================
