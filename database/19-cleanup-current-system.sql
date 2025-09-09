-- ================================================================
-- VERIFICACIÓN Y LIMPIEZA DEL SISTEMA ACTUAL
-- ================================================================

-- 1. DIAGNÓSTICO DEL ESTADO ACTUAL
-- ================================================================

DO $$
DECLARE
    tickets_with_manual_tags INTEGER;
    tickets_total INTEGER;
    service_tags_exists BOOLEAN;
    ticket_tags_exists BOOLEAN;
    orphaned_ticket_tags INTEGER;
BEGIN
    RAISE NOTICE '=== DIAGNÓSTICO DEL SISTEMA ACTUAL ===';
    RAISE NOTICE '';
    
    -- Verificar existencia de tablas
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'service_tags'
    ) INTO service_tags_exists;
    
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'ticket_tags'
    ) INTO ticket_tags_exists;
    
    RAISE NOTICE 'Tabla service_tags existe: %', service_tags_exists;
    RAISE NOTICE 'Tabla ticket_tags existe: %', ticket_tags_exists;
    
    -- Contar tickets
    SELECT COUNT(*) INTO tickets_total FROM tickets WHERE deleted_at IS NULL;
    RAISE NOTICE 'Total tickets en sistema: %', tickets_total;
    
    IF ticket_tags_exists THEN
        -- Contar tickets con tags manuales
        SELECT COUNT(DISTINCT ttr.ticket_id) INTO tickets_with_manual_tags
        FROM ticket_tag_relations ttr;
        
        RAISE NOTICE 'Tickets con tags manuales: %', tickets_with_manual_tags;
        
        -- Contar tags huérfanos (que no vienen de servicios)
        SELECT COUNT(*) INTO orphaned_ticket_tags
        FROM ticket_tags tt
        WHERE NOT EXISTS (
            SELECT 1 FROM service_tags st 
            WHERE st.name = tt.name
        );
        
        RAISE NOTICE 'Tags de tickets huérfanos (no vienen de servicios): %', orphaned_ticket_tags;
    END IF;
    
    RAISE NOTICE '';
END $$;

-- 2. MIGRACIÓN DE TAGS EXISTENTES
-- ================================================================

-- Función para migrar tags de tickets a tags de servicios
CREATE OR REPLACE FUNCTION migrate_ticket_tags_to_service_tags()
RETURNS TEXT AS $$
DECLARE
    company_record RECORD;
    tag_record RECORD;
    migrated_count INTEGER := 0;
    result_text TEXT := '';
BEGIN
    result_text := result_text || '=== MIGRACIÓN DE TAGS ===\n';
    
    -- Para cada empresa
    FOR company_record IN 
        SELECT id, name FROM companies WHERE deleted_at IS NULL 
    LOOP
        result_text := result_text || 'Procesando empresa: ' || company_record.name || '\n';
        
        -- Migrar tags únicos de tickets a service_tags para esta empresa
        FOR tag_record IN
            SELECT DISTINCT tt.name, tt.color, tt.description
            FROM ticket_tags tt
            JOIN ticket_tag_relations ttr ON tt.id = ttr.tag_id
            JOIN tickets t ON ttr.ticket_id = t.id
            WHERE t.company_id = company_record.id
            AND NOT EXISTS (
                SELECT 1 FROM service_tags st 
                WHERE st.name = tt.name 
                AND st.company_id = company_record.id
            )
        LOOP
            INSERT INTO service_tags (name, color, description, company_id)
            VALUES (
                tag_record.name,
                COALESCE(tag_record.color, '#6b7280'),
                COALESCE(tag_record.description, 'Tag migrado desde sistema de tickets'),
                company_record.id
            )
            ON CONFLICT (name, company_id) DO NOTHING;
            
            GET DIAGNOSTICS migrated_count = ROW_COUNT;
            IF migrated_count > 0 THEN
                result_text := result_text || '  ✓ Tag migrado: ' || tag_record.name || '\n';
            END IF;
        END LOOP;
    END LOOP;
    
    result_text := result_text || 'Migración completada\n';
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- 3. LIMPIEZA DE DATOS DUPLICADOS
-- ================================================================

-- Función para limpiar tags duplicados
CREATE OR REPLACE FUNCTION cleanup_duplicate_tags()
RETURNS TEXT AS $$
DECLARE
    duplicate_count INTEGER;
    result_text TEXT := '';
BEGIN
    result_text := result_text || '=== LIMPIEZA DE DUPLICADOS ===\n';
    
    -- Eliminar service_tags duplicados, manteniendo el más reciente
    WITH duplicates AS (
        SELECT id, 
               ROW_NUMBER() OVER (
                   PARTITION BY name, company_id 
                   ORDER BY created_at DESC
               ) as rn
        FROM service_tags
    )
    DELETE FROM service_tags 
    WHERE id IN (
        SELECT id FROM duplicates WHERE rn > 1
    );
    
    GET DIAGNOSTICS duplicate_count = ROW_COUNT;
    result_text := result_text || 'Service tags duplicados eliminados: ' || duplicate_count::text || '\n';
    
    -- Limpiar relaciones huérfanas
    DELETE FROM service_tag_relations str
    WHERE NOT EXISTS (
        SELECT 1 FROM service_tags st WHERE st.id = str.tag_id
    )
    OR NOT EXISTS (
        SELECT 1 FROM services s WHERE s.id = str.service_id
    );
    
    GET DIAGNOSTICS duplicate_count = ROW_COUNT;
    result_text := result_text || 'Relaciones huérfanas eliminadas: ' || duplicate_count::text || '\n';
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- 4. SCRIPT DE EJECUCIÓN DE LIMPIEZA
-- ================================================================

DO $$
DECLARE
    migration_result TEXT;
    cleanup_result TEXT;
BEGIN
    RAISE NOTICE 'Iniciando proceso de limpieza y migración...';
    RAISE NOTICE '';
    
    -- Ejecutar migración
    SELECT migrate_ticket_tags_to_service_tags() INTO migration_result;
    RAISE NOTICE '%', migration_result;
    
    -- Ejecutar limpieza
    SELECT cleanup_duplicate_tags() INTO cleanup_result;
    RAISE NOTICE '%', cleanup_result;
    
    RAISE NOTICE 'Proceso completado exitosamente';
END $$;

-- 5. VERIFICACIÓN POST-LIMPIEZA
-- ================================================================

DO $$
DECLARE
    service_tags_count INTEGER;
    active_service_tags INTEGER;
    companies_count INTEGER;
    relations_count INTEGER;
    orphaned_relations INTEGER;
BEGIN
    -- Conteos finales
    SELECT COUNT(*) INTO service_tags_count FROM service_tags;
    SELECT COUNT(*) INTO active_service_tags FROM service_tags WHERE is_active = true;
    SELECT COUNT(*) INTO companies_count FROM companies WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO relations_count FROM service_tag_relations;
    
    -- Verificar relaciones huérfanas
    SELECT COUNT(*) INTO orphaned_relations
    FROM service_tag_relations str
    WHERE NOT EXISTS (
        SELECT 1 FROM service_tags st WHERE st.id = str.tag_id
    )
    OR NOT EXISTS (
        SELECT 1 FROM services s WHERE s.id = str.service_id AND s.deleted_at IS NULL
    );
    
    RAISE NOTICE '';
    RAISE NOTICE '=== VERIFICACIÓN POST-LIMPIEZA ===';
    RAISE NOTICE 'Empresas en sistema: %', companies_count;
    RAISE NOTICE 'Service tags totales: %', service_tags_count;
    RAISE NOTICE 'Service tags activos: %', active_service_tags;
    RAISE NOTICE 'Relaciones servicio-tag: %', relations_count;
    RAISE NOTICE 'Relaciones huérfanas: %', orphaned_relations;
    
    IF orphaned_relations = 0 THEN
        RAISE NOTICE '✅ Sistema limpio y optimizado';
    ELSE
        RAISE NOTICE '⚠️ Aún hay % relaciones huérfanas que requieren atención', orphaned_relations;
    END IF;
    
    RAISE NOTICE '';
END $$;
