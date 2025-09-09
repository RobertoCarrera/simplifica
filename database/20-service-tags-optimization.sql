-- ================================================================
-- OPTIMIZACIÓN COMPLETA DEL SISTEMA DE TAGS DE SERVICIOS
-- ================================================================

-- 1. CORRECCIÓN DE ESTRUCTURA DE TABLAS
-- ================================================================

-- Corregir tipo de dato en service_tags.company_id (debe ser UUID, no VARCHAR)
DO $$
BEGIN
    -- Verificar si la columna existe y es del tipo incorrecto
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'service_tags' 
        AND column_name = 'company_id' 
        AND data_type = 'character varying'
    ) THEN
        -- Eliminar datos existentes para evitar problemas de conversión
        DELETE FROM service_tag_relations;
        DELETE FROM service_tags;
        
        -- Modificar el tipo de columna
        ALTER TABLE service_tags ALTER COLUMN company_id TYPE UUID USING company_id::UUID;
        
        RAISE NOTICE 'Tipo de dato de service_tags.company_id corregido a UUID';
    END IF;
END $$;

-- Agregar constraint de foreign key para company_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'service_tags_company_id_fkey'
    ) THEN
        ALTER TABLE service_tags 
        ADD CONSTRAINT service_tags_company_id_fkey 
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Foreign key constraint agregado para service_tags.company_id';
    END IF;
END $$;

-- 2. POLÍTICAS RLS PARA SERVICE_TAGS
-- ================================================================

-- Habilitar RLS en service_tags
ALTER TABLE service_tags ENABLE ROW LEVEL SECURITY;

-- Política para permitir operaciones en service_tags por empresa
DROP POLICY IF EXISTS "allow_company_service_tags" ON service_tags;
CREATE POLICY "allow_company_service_tags" ON service_tags
    FOR ALL USING (
        (get_current_company_id() IS NULL) OR 
        (company_id = get_current_company_id())
    );

-- 3. POLÍTICAS RLS PARA SERVICE_TAG_RELATIONS
-- ================================================================

-- Habilitar RLS en service_tag_relations
ALTER TABLE service_tag_relations ENABLE ROW LEVEL SECURITY;

-- Política para permitir operaciones en service_tag_relations por empresa
DROP POLICY IF EXISTS "allow_company_service_tag_relations" ON service_tag_relations;
CREATE POLICY "allow_company_service_tag_relations" ON service_tag_relations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM services s 
            WHERE s.id = service_tag_relations.service_id 
            AND s.company_id = get_current_company_id()
        )
    );

-- 4. OPTIMIZACIÓN DE ÍNDICES
-- ================================================================

-- Índices básicos
CREATE INDEX IF NOT EXISTS idx_service_tags_company_active 
ON service_tags(company_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_service_tags_name_search 
ON service_tags(company_id, name) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_service_tag_relations_service 
ON service_tag_relations(service_id);

CREATE INDEX IF NOT EXISTS idx_service_tag_relations_tag 
ON service_tag_relations(tag_id);

-- Índices compuestos para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_service_tags_lookup 
ON service_tags(company_id, name, is_active);

-- 5. FUNCIÓN MEJORADA PARA SINCRONIZACIÓN DE TAGS
-- ================================================================

CREATE OR REPLACE FUNCTION sync_ticket_tags_from_services()
RETURNS TRIGGER AS $$
BEGIN
    -- Cuando se añade un servicio a un ticket, heredar sus tags
    IF TG_OP = 'INSERT' THEN
        -- Agregar tags del servicio al ticket
        INSERT INTO ticket_tag_relations (ticket_id, tag_id)
        SELECT DISTINCT
            NEW.ticket_id,
            str.tag_id
        FROM service_tag_relations str
        JOIN service_tags st ON str.tag_id = st.id
        WHERE str.service_id = NEW.service_id
        AND st.is_active = true
        AND NOT EXISTS (
            SELECT 1 FROM ticket_tag_relations ttr 
            WHERE ttr.ticket_id = NEW.ticket_id 
            AND ttr.tag_id = str.tag_id
        );
        
        RAISE NOTICE 'Tags sincronizados para ticket % desde servicio %', NEW.ticket_id, NEW.service_id;
    END IF;
    
    -- Cuando se elimina un servicio de un ticket, limpiar tags huérfanos
    IF TG_OP = 'DELETE' THEN
        -- Eliminar tags que ya no tienen servicios asociados en este ticket
        DELETE FROM ticket_tag_relations ttr
        WHERE ttr.ticket_id = OLD.ticket_id
        AND ttr.tag_id IN (
            SELECT str.tag_id 
            FROM service_tag_relations str 
            WHERE str.service_id = OLD.service_id
        )
        AND NOT EXISTS (
            -- Verificar que no hay otros servicios en el ticket con la misma tag
            SELECT 1 FROM ticket_services ts2
            JOIN service_tag_relations str2 ON ts2.service_id = str2.service_id
            WHERE ts2.ticket_id = OLD.ticket_id
            AND str2.tag_id = ttr.tag_id
            AND ts2.id != OLD.id
        );
        
        RAISE NOTICE 'Tags limpiados para ticket % tras eliminar servicio %', OLD.ticket_id, OLD.service_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 6. TRIGGERS PARA SINCRONIZACIÓN AUTOMÁTICA
-- ================================================================

-- Recrear trigger para INSERT y DELETE
DROP TRIGGER IF EXISTS trigger_sync_ticket_tags_from_services ON ticket_services;
CREATE TRIGGER trigger_sync_ticket_tags_from_services
    AFTER INSERT OR DELETE ON ticket_services
    FOR EACH ROW
    EXECUTE FUNCTION sync_ticket_tags_from_services();

-- 7. FUNCIÓN PARA OBTENER TAGS DE SERVICIOS POR EMPRESA
-- ================================================================

CREATE OR REPLACE FUNCTION get_service_tags_by_company(company_uuid UUID)
RETURNS TABLE(
    id UUID,
    name VARCHAR(50),
    color VARCHAR(7),
    description TEXT,
    is_active BOOLEAN,
    usage_count BIGINT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        st.id,
        st.name,
        st.color,
        st.description,
        st.is_active,
        COUNT(str.service_id) as usage_count,
        st.created_at
    FROM service_tags st
    LEFT JOIN service_tag_relations str ON st.id = str.tag_id
    WHERE st.company_id = company_uuid
    AND st.is_active = true
    GROUP BY st.id, st.name, st.color, st.description, st.is_active, st.created_at
    ORDER BY usage_count DESC, st.name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. FUNCIÓN PARA OBTENER SERVICIOS CON SUS TAGS
-- ================================================================

CREATE OR REPLACE FUNCTION get_services_with_tags(company_uuid UUID)
RETURNS TABLE(
    service_id UUID,
    service_name VARCHAR,
    service_description TEXT,
    tags JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as service_id,
        s.name as service_name,
        s.description as service_description,
        COALESCE(
            json_agg(
                json_build_object(
                    'id', st.id,
                    'name', st.name,
                    'color', st.color
                )
            ) FILTER (WHERE st.id IS NOT NULL),
            '[]'::json
        ) as tags
    FROM services s
    LEFT JOIN service_tag_relations str ON s.id = str.service_id
    LEFT JOIN service_tags st ON str.tag_id = st.id AND st.is_active = true
    WHERE s.company_id = company_uuid
    AND s.deleted_at IS NULL
    GROUP BY s.id, s.name, s.description
    ORDER BY s.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. FUNCIÓN PARA LIMPIAR TAGS HUÉRFANOS
-- ================================================================

CREATE OR REPLACE FUNCTION cleanup_orphaned_tags()
RETURNS TEXT AS $$
DECLARE
    orphaned_count INTEGER;
    result_text TEXT;
BEGIN
    -- Contar tags huérfanos (sin relaciones con servicios)
    SELECT COUNT(*) INTO orphaned_count
    FROM service_tags st
    WHERE NOT EXISTS (
        SELECT 1 FROM service_tag_relations str 
        WHERE str.tag_id = st.id
    )
    AND st.is_active = false;
    
    -- Eliminar tags huérfanos inactivos
    DELETE FROM service_tags st
    WHERE NOT EXISTS (
        SELECT 1 FROM service_tag_relations str 
        WHERE str.tag_id = st.id
    )
    AND st.is_active = false;
    
    result_text := 'Tags huérfanos eliminados: ' || orphaned_count::text;
    
    RAISE NOTICE '%', result_text;
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- 10. CREAR TAGS BÁSICOS PARA EMPRESAS EXISTENTES
-- ================================================================

DO $$
DECLARE
    company_record RECORD;
    tag_colors TEXT[] := ARRAY['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
    tag_names TEXT[] := ARRAY['Hardware', 'Software', 'Reparación', 'Diagnóstico', 'Mantenimiento', 'Instalación', 'Configuración', 'Urgente'];
    i INTEGER;
    tags_created INTEGER := 0;
BEGIN
    RAISE NOTICE 'Iniciando creación de tags básicos...';
    
    -- Para cada empresa activa
    FOR company_record IN 
        SELECT id, name FROM companies WHERE deleted_at IS NULL 
    LOOP
        RAISE NOTICE 'Procesando empresa: % (ID: %)', company_record.name, company_record.id;
        
        -- Crear cada tag con su color correspondiente
        FOR i IN 1..array_length(tag_names, 1) LOOP
            INSERT INTO service_tags (name, color, company_id, description)
            VALUES (
                tag_names[i],
                tag_colors[i],
                company_record.id,
                CASE tag_names[i]
                    WHEN 'Hardware' THEN 'Servicios relacionados con componentes físicos'
                    WHEN 'Software' THEN 'Servicios de sistema operativo y aplicaciones'
                    WHEN 'Reparación' THEN 'Servicios de reparación y arreglo'
                    WHEN 'Diagnóstico' THEN 'Servicios de análisis y diagnóstico'
                    WHEN 'Mantenimiento' THEN 'Servicios de mantenimiento preventivo'
                    WHEN 'Instalación' THEN 'Servicios de instalación y configuración'
                    WHEN 'Configuración' THEN 'Servicios de configuración de sistema'
                    WHEN 'Urgente' THEN 'Servicios que requieren atención inmediata'
                    ELSE 'Tag de servicio'
                END
            )
            ON CONFLICT (name, company_id) DO NOTHING;
            
            GET DIAGNOSTICS tags_created = ROW_COUNT;
            IF tags_created > 0 THEN
                RAISE NOTICE '  ✓ Tag creado: %', tag_names[i];
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Tags básicos configurados para todas las empresas';
END $$;

-- 11. VERIFICACIÓN FINAL DEL SISTEMA
-- ================================================================

DO $$
DECLARE
    service_tags_count INTEGER;
    companies_count INTEGER;
    relations_count INTEGER;
    active_tags_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO service_tags_count FROM service_tags;
    SELECT COUNT(*) INTO active_tags_count FROM service_tags WHERE is_active = true;
    SELECT COUNT(*) INTO relations_count FROM service_tag_relations;
    SELECT COUNT(*) INTO companies_count FROM companies WHERE deleted_at IS NULL;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== RESUMEN OPTIMIZACIÓN SISTEMA SERVICE TAGS ===';
    RAISE NOTICE 'Empresas en sistema: %', companies_count;
    RAISE NOTICE 'Service tags totales: %', service_tags_count;
    RAISE NOTICE 'Service tags activos: %', active_tags_count;
    RAISE NOTICE 'Relaciones servicio-tag: %', relations_count;
    RAISE NOTICE 'Políticas RLS: ACTIVADAS';
    RAISE NOTICE 'Triggers de sincronización: CONFIGURADOS';
    RAISE NOTICE 'Funciones de consulta: CREADAS';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Sistema de tags optimizado y listo para uso';
    RAISE NOTICE '';
END $$;
