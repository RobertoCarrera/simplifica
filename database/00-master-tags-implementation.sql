-- ================================================================
-- SCRIPT MAESTRO: IMPLEMENTACIÓN COMPLETA DEL SISTEMA DE TAGS
-- ================================================================
-- 
-- Este script ejecuta en orden todos los pasos necesarios para:
-- 1. Limpiar el sistema actual
-- 2. Optimizar las estructuras de datos
-- 3. Configurar la sincronización automática
-- 4. Migrar datos existentes
-- 5. Verificar el funcionamiento
--
-- IMPORTANTE: Ejecutar este script en un entorno de prueba primero
-- ================================================================

-- CONFIGURACIÓN INICIAL
SET client_min_messages = NOTICE;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🚀 INICIANDO IMPLEMENTACIÓN COMPLETA DEL SISTEMA DE TAGS';
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'Fecha: %', NOW();
    RAISE NOTICE 'Base de datos: %', current_database();
    RAISE NOTICE '================================================================';
    RAISE NOTICE '';
END $$;

-- ================================================================
-- PASO 1: DIAGNÓSTICO INICIAL DEL SISTEMA
-- ================================================================

DO $$
DECLARE
    service_tags_exists BOOLEAN;
    ticket_tags_exists BOOLEAN;
    companies_count INTEGER;
    services_count INTEGER;
    tickets_count INTEGER;
BEGIN
    RAISE NOTICE '📊 PASO 1: DIAGNÓSTICO INICIAL';
    RAISE NOTICE '--------------------------------';
    
    -- Verificar existencia de tablas clave
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'service_tags'
    ) INTO service_tags_exists;
    
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'ticket_tags'
    ) INTO ticket_tags_exists;
    
    -- Contar registros principales
    SELECT COUNT(*) INTO companies_count FROM companies WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO services_count FROM services WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO tickets_count FROM tickets WHERE deleted_at IS NULL;
    
    RAISE NOTICE 'Tabla service_tags existe: %', service_tags_exists;
    RAISE NOTICE 'Tabla ticket_tags existe: %', ticket_tags_exists;
    RAISE NOTICE 'Empresas activas: %', companies_count;
    RAISE NOTICE 'Servicios activos: %', services_count;
    RAISE NOTICE 'Tickets activos: %', tickets_count;
    RAISE NOTICE '';
    
    IF companies_count = 0 THEN
        RAISE EXCEPTION 'No hay empresas en el sistema. Ejecutar setup de empresas primero.';
    END IF;
    
    IF services_count = 0 THEN
        RAISE WARNING 'No hay servicios en el sistema. Se recomienda crear servicios antes de continuar.';
    END IF;
END $$;

-- ================================================================
-- PASO 2: CREAR/CORREGIR ESTRUCTURA DE TABLAS
-- ================================================================

DO $$
BEGIN
    RAISE NOTICE '🔧 PASO 2: CONFIGURACIÓN DE ESTRUCTURAS';
    RAISE NOTICE '----------------------------------------';
END $$;

-- Crear tabla service_tags si no existe
CREATE TABLE IF NOT EXISTS service_tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#6b7280',
    description TEXT,
    company_id UUID NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT service_tags_name_company_unique UNIQUE (name, company_id)
);

-- Agregar foreign key constraint si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'service_tags_company_id_fkey'
    ) THEN
        ALTER TABLE service_tags 
        ADD CONSTRAINT service_tags_company_id_fkey 
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
        
        RAISE NOTICE '✓ Foreign key constraint agregado para service_tags.company_id';
    END IF;
END $$;

-- Crear tabla service_tag_relations si no existe
CREATE TABLE IF NOT EXISTS service_tag_relations (
    service_id UUID NOT NULL,
    tag_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (service_id, tag_id),
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES service_tags(id) ON DELETE CASCADE
);

DO $$
BEGIN
    RAISE NOTICE '✓ Estructura de tablas configurada';
END $$;

-- ================================================================
-- PASO 3: CONFIGURAR POLÍTICAS RLS
-- ================================================================

DO $$
BEGIN
    RAISE NOTICE '🔒 PASO 3: CONFIGURACIÓN DE SEGURIDAD RLS';
    RAISE NOTICE '-------------------------------------------';
END $$;

-- Habilitar RLS en service_tags
ALTER TABLE service_tags ENABLE ROW LEVEL SECURITY;

-- Política para service_tags
DROP POLICY IF EXISTS "allow_company_service_tags" ON service_tags;
CREATE POLICY "allow_company_service_tags" ON service_tags
    FOR ALL USING (
        (get_current_company_id() IS NULL) OR 
        (company_id = get_current_company_id())
    );

-- Habilitar RLS en service_tag_relations
ALTER TABLE service_tag_relations ENABLE ROW LEVEL SECURITY;

-- Política para service_tag_relations
DROP POLICY IF EXISTS "allow_company_service_tag_relations" ON service_tag_relations;
CREATE POLICY "allow_company_service_tag_relations" ON service_tag_relations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM services s 
            WHERE s.id = service_tag_relations.service_id 
            AND s.company_id = get_current_company_id()
        )
    );
DO $$
BEGIN
    RAISE NOTICE '✓ Políticas RLS configuradas';
END $$;

-- ================================================================
-- PASO 4: CREAR ÍNDICES DE OPTIMIZACIÓN
-- ================================================================

DO $$
BEGIN
    RAISE NOTICE '⚡ PASO 4: OPTIMIZACIÓN DE ÍNDICES';
    RAISE NOTICE '--------------------------------';
END $$;

-- Índices para service_tags
CREATE INDEX IF NOT EXISTS idx_service_tags_company_active 
ON service_tags(company_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_service_tags_name_search 
ON service_tags(company_id, name) WHERE is_active = true;

-- Asegurar índice único para permitir INSERT ... ON CONFLICT (name, company_id)
-- Si la tabla fue creada anteriormente sin la constraint, esto garantiza el target
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_tags_name_company_unique
ON service_tags(name, company_id);

-- Índices para service_tag_relations
CREATE INDEX IF NOT EXISTS idx_service_tag_relations_service 
ON service_tag_relations(service_id);

CREATE INDEX IF NOT EXISTS idx_service_tag_relations_tag 
ON service_tag_relations(tag_id);

-- Índice compuesto para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_service_tags_lookup 
ON service_tags(company_id, name, is_active);
DO $$
BEGIN
    RAISE NOTICE '✓ Índices de optimización creados';
END $$;

-- ================================================================
-- PASO 5: MIGRAR DATOS EXISTENTES
-- ================================================================

DO $$
DECLARE
    migration_count INTEGER := 0;
    company_record RECORD;
    tag_record RECORD;
BEGIN
    RAISE NOTICE '📦 PASO 5: MIGRACIÓN DE DATOS EXISTENTES';
    RAISE NOTICE '----------------------------------------';
    
    -- Migrar tags de tickets existentes a service_tags si existe la tabla ticket_tags
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ticket_tags') THEN
        
        FOR company_record IN 
            SELECT id, name FROM companies WHERE deleted_at IS NULL 
        LOOP
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
                
                GET DIAGNOSTICS migration_count = ROW_COUNT;
                IF migration_count > 0 THEN
                    RAISE NOTICE '  ✓ Tag migrado para %: %', company_record.name, tag_record.name;
                END IF;
            END LOOP;
        END LOOP;
        
                RAISE NOTICE '✓ Migración de tags existentes completada';
    ELSE
                RAISE NOTICE '✓ No hay tabla ticket_tags para migrar';
    END IF;
END $$;

-- ================================================================
-- PASO 6: CREAR TAGS BÁSICOS PARA EMPRESAS
-- ================================================================

DO $$
DECLARE
    company_record RECORD;
    tag_colors TEXT[] := ARRAY['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
    tag_names TEXT[] := ARRAY['Hardware', 'Software', 'Reparación', 'Diagnóstico', 'Mantenimiento', 'Instalación', 'Configuración', 'Urgente'];
    i INTEGER;
    created_count INTEGER := 0;
BEGIN
    RAISE NOTICE '🏷️  PASO 6: CREACIÓN DE TAGS BÁSICOS';
    RAISE NOTICE '-----------------------------------';
    
    FOR company_record IN 
        SELECT id, name FROM companies WHERE deleted_at IS NULL 
    LOOP
        RAISE NOTICE 'Procesando empresa: %', company_record.name;
        
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
            
            GET DIAGNOSTICS created_count = ROW_COUNT;
            IF created_count > 0 THEN
                RAISE NOTICE '  ✓ Tag creado: %', tag_names[i];
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE '✓ Tags básicos creados para todas las empresas';
END $$;

-- ================================================================
-- PASO 7: CONFIGURAR FUNCIONES DE SINCRONIZACIÓN
-- ================================================================

DO $$
BEGIN
    RAISE NOTICE '🔄 PASO 7: CONFIGURACIÓN DE SINCRONIZACIÓN';
    RAISE NOTICE '-------------------------------------------';
END $$;

-- Función principal de sincronización ticket-service
CREATE OR REPLACE FUNCTION sync_ticket_tags_from_services_enhanced()
RETURNS TRIGGER AS $$
DECLARE
    tag_count INTEGER;
BEGIN
    IF TG_OP = 'INSERT' THEN
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
        
        GET DIAGNOSTICS tag_count = ROW_COUNT;
        IF tag_count > 0 THEN
            RAISE NOTICE 'Servicio agregado al ticket %: % tags heredados', NEW.ticket_id, tag_count;
        END IF;
        
        RETURN NEW;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        DELETE FROM ticket_tag_relations ttr
        WHERE ttr.ticket_id = OLD.ticket_id
        AND ttr.tag_id IN (
            SELECT str.tag_id 
            FROM service_tag_relations str 
            WHERE str.service_id = OLD.service_id
        )
        AND NOT EXISTS (
            SELECT 1 FROM ticket_services ts2
            JOIN service_tag_relations str2 ON ts2.service_id = str2.service_id
            WHERE ts2.ticket_id = OLD.ticket_id
            AND str2.tag_id = ttr.tag_id
            AND ts2.id != OLD.id
        );
        
        GET DIAGNOSTICS tag_count = ROW_COUNT;
        IF tag_count > 0 THEN
            RAISE NOTICE 'Servicio eliminado del ticket %: % tags limpiados', OLD.ticket_id, tag_count;
        END IF;
        
        RETURN OLD;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Crear triggers
DROP TRIGGER IF EXISTS trigger_sync_ticket_tags_from_services_enhanced ON ticket_services;
CREATE TRIGGER trigger_sync_ticket_tags_from_services_enhanced
    AFTER INSERT OR DELETE ON ticket_services
    FOR EACH ROW
    EXECUTE FUNCTION sync_ticket_tags_from_services_enhanced();

DO $$
BEGIN
    RAISE NOTICE '✓ Función y trigger de sincronización configurados';
END $$;

-- ================================================================
-- PASO 8: SINCRONIZACIÓN INICIAL DE DATOS EXISTENTES
-- ================================================================

DO $$
DECLARE
    synced_tickets INTEGER := 0;
    total_tickets INTEGER;
    ticket_record RECORD;
    tag_count INTEGER;
BEGIN
    RAISE NOTICE '🔄 PASO 8: SINCRONIZACIÓN INICIAL';
    RAISE NOTICE '--------------------------------';
    
    -- Contar tickets con servicios
    SELECT COUNT(DISTINCT t.id) INTO total_tickets 
    FROM tickets t 
    JOIN ticket_services ts ON t.id = ts.ticket_id
    WHERE t.deleted_at IS NULL;
    
    RAISE NOTICE 'Tickets con servicios a procesar: %', total_tickets;
    
    -- Sincronizar cada ticket
    FOR ticket_record IN
        SELECT DISTINCT t.id as ticket_id, t.ticket_number
        FROM tickets t
        JOIN ticket_services ts ON t.id = ts.ticket_id
        WHERE t.deleted_at IS NULL
        ORDER BY t.ticket_number
    LOOP
        INSERT INTO ticket_tag_relations (ticket_id, tag_id)
        SELECT DISTINCT
            ticket_record.ticket_id,
            str.tag_id
        FROM ticket_services ts
        JOIN service_tag_relations str ON ts.service_id = str.service_id
        JOIN service_tags st ON str.tag_id = st.id
        WHERE ts.ticket_id = ticket_record.ticket_id
        AND st.is_active = true
        AND NOT EXISTS (
            SELECT 1 FROM ticket_tag_relations ttr 
            WHERE ttr.ticket_id = ticket_record.ticket_id 
            AND ttr.tag_id = str.tag_id
        );
        
        GET DIAGNOSTICS tag_count = ROW_COUNT;
        
        IF tag_count > 0 THEN
            synced_tickets := synced_tickets + 1;
            RAISE NOTICE '  ✓ Ticket #%: % tags sincronizados', ticket_record.ticket_number, tag_count;
        END IF;
    END LOOP;
    
    RAISE NOTICE '✓ Sincronización inicial completada: % tickets actualizados', synced_tickets;
END $$;

-- ================================================================
-- PASO 9: VERIFICACIÓN FINAL
-- ================================================================

DO $$
DECLARE
    service_tags_count INTEGER;
    active_service_tags INTEGER;
    companies_count INTEGER;
    relations_count INTEGER;
    synced_tickets INTEGER;
    orphaned_relations INTEGER;
BEGIN
    RAISE NOTICE '✅ PASO 9: VERIFICACIÓN FINAL';
    RAISE NOTICE '----------------------------';
    
    -- Conteos finales
    SELECT COUNT(*) INTO service_tags_count FROM service_tags;
    SELECT COUNT(*) INTO active_service_tags FROM service_tags WHERE is_active = true;
    SELECT COUNT(*) INTO companies_count FROM companies WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO relations_count FROM service_tag_relations;
    
    -- Contar tickets con tags sincronizados
    SELECT COUNT(DISTINCT ttr.ticket_id) INTO synced_tickets
    FROM ticket_tag_relations ttr
    JOIN service_tags st ON ttr.tag_id = st.id;
    
    -- Verificar relaciones huérfanas
    SELECT COUNT(*) INTO orphaned_relations
    FROM service_tag_relations str
    WHERE NOT EXISTS (
        SELECT 1 FROM service_tags st WHERE st.id = str.tag_id
    )
    OR NOT EXISTS (
        SELECT 1 FROM services s WHERE s.id = str.service_id AND s.deleted_at IS NULL
    );
    
    RAISE NOTICE 'Empresas en sistema: %', companies_count;
    RAISE NOTICE 'Service tags totales: %', service_tags_count;
    RAISE NOTICE 'Service tags activos: %', active_service_tags;
    RAISE NOTICE 'Relaciones servicio-tag: %', relations_count;
    RAISE NOTICE 'Tickets con tags sincronizados: %', synced_tickets;
    RAISE NOTICE 'Relaciones huérfanas: %', orphaned_relations;
    
    IF orphaned_relations = 0 THEN
        RAISE NOTICE '✅ Sistema completamente optimizado y funcional';
    ELSE
        RAISE NOTICE '⚠️ Hay % relaciones huérfanas que requieren revisión', orphaned_relations;
    END IF;
END $$;

-- ================================================================
-- RESUMEN FINAL
-- ================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 IMPLEMENTACIÓN COMPLETADA EXITOSAMENTE';
    RAISE NOTICE '================================================================';
    RAISE NOTICE 'El sistema de tags de servicios está ahora configurado y operativo:';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Estructuras de datos optimizadas';
    RAISE NOTICE '✅ Políticas de seguridad RLS configuradas';
    RAISE NOTICE '✅ Índices de rendimiento creados';
    RAISE NOTICE '✅ Datos existentes migrados';
    RAISE NOTICE '✅ Tags básicos creados para todas las empresas';
    RAISE NOTICE '✅ Sincronización automática configurada';
    RAISE NOTICE '✅ Datos existentes sincronizados';
    RAISE NOTICE '';
    RAISE NOTICE 'PRÓXIMOS PASOS:';
    RAISE NOTICE '1. Probar la funcionalidad en el frontend';
    RAISE NOTICE '2. Asignar tags a servicios existentes';
    RAISE NOTICE '3. Verificar herencia automática en tickets';
    RAISE NOTICE '';
    RAISE NOTICE 'Fecha de finalización: %', NOW();
    RAISE NOTICE '================================================================';
    RAISE NOTICE '';
END $$;
