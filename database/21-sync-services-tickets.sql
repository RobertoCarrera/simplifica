-- ================================================================
-- SINCRONIZACIÓN AUTOMÁTICA SERVICIOS → TICKETS
-- ================================================================

-- 1. FUNCIÓN PRINCIPAL DE SINCRONIZACIÓN
-- ================================================================

CREATE OR REPLACE FUNCTION sync_all_ticket_tags_from_services()
RETURNS TEXT AS $$
DECLARE
    ticket_record RECORD;
    synced_tickets INTEGER := 0;
    synced_tags INTEGER := 0;
    total_tickets INTEGER;
    result_text TEXT := '';
BEGIN
    result_text := result_text || '=== SINCRONIZACIÓN MASIVA DE TAGS ===\n';
    
    -- Contar tickets totales
    SELECT COUNT(*) INTO total_tickets 
    FROM tickets t 
    WHERE t.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM ticket_services ts WHERE ts.ticket_id = t.id);
    
    result_text := result_text || 'Tickets con servicios a procesar: ' || total_tickets::text || '\n\n';
    
    -- Para cada ticket que tiene servicios asociados
    FOR ticket_record IN
        SELECT DISTINCT t.id as ticket_id, t.ticket_number, c.name as company_name
        FROM tickets t
        JOIN companies c ON t.company_id = c.id
        WHERE t.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM ticket_services ts WHERE ts.ticket_id = t.id)
        ORDER BY t.ticket_number
    LOOP
        -- Sincronizar tags para este ticket
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
        
        GET DIAGNOSTICS synced_tags = ROW_COUNT;
        
        IF synced_tags > 0 THEN
            synced_tickets := synced_tickets + 1;
            result_text := result_text || 'Ticket #' || ticket_record.ticket_number::text || 
                          ' (' || ticket_record.company_name || '): ' || synced_tags::text || ' tags añadidos\n';
        END IF;
    END LOOP;
    
    result_text := result_text || '\n=== RESUMEN ===\n';
    result_text := result_text || 'Tickets procesados: ' || total_tickets::text || '\n';
    result_text := result_text || 'Tickets actualizados: ' || synced_tickets::text || '\n';
    result_text := result_text || 'Sincronización completada\n';
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- 2. FUNCIÓN PARA LIMPIAR TAGS INCONSISTENTES
-- ================================================================

CREATE OR REPLACE FUNCTION cleanup_inconsistent_ticket_tags()
RETURNS TEXT AS $$
DECLARE
    removed_count INTEGER := 0;
    result_text TEXT := '';
BEGIN
    result_text := result_text || '=== LIMPIEZA DE TAGS INCONSISTENTES ===\n';
    
    -- Eliminar tags de tickets que ya no tienen servicios con esas tags
    WITH inconsistent_tags AS (
        SELECT ttr.ticket_id, ttr.tag_id
        FROM ticket_tag_relations ttr
        WHERE NOT EXISTS (
            -- Verificar que al menos un servicio del ticket tiene esta tag
            SELECT 1 
            FROM ticket_services ts
            JOIN service_tag_relations str ON ts.service_id = str.service_id
            WHERE ts.ticket_id = ttr.ticket_id
            AND str.tag_id = ttr.tag_id
        )
        -- Solo eliminar tags que provienen del sistema de servicios
        AND EXISTS (
            SELECT 1 FROM service_tags st 
            WHERE st.id = ttr.tag_id
        )
    )
    DELETE FROM ticket_tag_relations ttr
    WHERE EXISTS (
        SELECT 1 FROM inconsistent_tags it
        WHERE it.ticket_id = ttr.ticket_id 
        AND it.tag_id = ttr.tag_id
    );
    
    GET DIAGNOSTICS removed_count = ROW_COUNT;
    
    result_text := result_text || 'Tags inconsistentes eliminados: ' || removed_count::text || '\n';
    result_text := result_text || 'Limpieza completada\n';
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- 3. TRIGGER MEJORADO PARA SINCRONIZACIÓN EN TIEMPO REAL
-- ================================================================

CREATE OR REPLACE FUNCTION sync_ticket_tags_from_services_enhanced()
RETURNS TRIGGER AS $$
DECLARE
    tag_count INTEGER;
BEGIN
    -- INSERT: Cuando se añade un servicio a un ticket
    IF TG_OP = 'INSERT' THEN
        -- Añadir todas las tags del servicio al ticket
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
    
    -- DELETE: Cuando se elimina un servicio de un ticket
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
        
        GET DIAGNOSTICS tag_count = ROW_COUNT;
        
        IF tag_count > 0 THEN
            RAISE NOTICE 'Servicio eliminado del ticket %: % tags limpiados', OLD.ticket_id, tag_count;
        END IF;
        
        RETURN OLD;
    END IF;
    
    -- UPDATE: Cuando se actualiza la relación servicio-ticket
    IF TG_OP = 'UPDATE' THEN
        -- Si cambió el servicio, limpiar tags del servicio anterior y añadir del nuevo
        IF OLD.service_id != NEW.service_id THEN
            -- Limpiar tags del servicio anterior
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
                AND ts2.id != NEW.id
            );
            
            -- Añadir tags del nuevo servicio
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
            
            RAISE NOTICE 'Servicio actualizado en ticket %: tags sincronizados', NEW.ticket_id;
        END IF;
        
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 4. RECREAR TRIGGERS CON FUNCIONALIDAD MEJORADA
-- ================================================================

-- Eliminar trigger anterior
DROP TRIGGER IF EXISTS trigger_sync_ticket_tags_from_services ON ticket_services;

-- Crear trigger mejorado
CREATE TRIGGER trigger_sync_ticket_tags_from_services_enhanced
    AFTER INSERT OR UPDATE OR DELETE ON ticket_services
    FOR EACH ROW
    EXECUTE FUNCTION sync_ticket_tags_from_services_enhanced();

-- 5. TRIGGER PARA CAMBIOS EN SERVICE_TAG_RELATIONS
-- ================================================================

CREATE OR REPLACE FUNCTION sync_tickets_on_service_tag_change()
RETURNS TRIGGER AS $$
DECLARE
    affected_tickets INTEGER;
BEGIN
    -- INSERT: Cuando se añade una tag a un servicio
    IF TG_OP = 'INSERT' THEN
        -- Añadir la tag a todos los tickets que usan este servicio
        INSERT INTO ticket_tag_relations (ticket_id, tag_id)
        SELECT DISTINCT
            ts.ticket_id,
            NEW.tag_id
        FROM ticket_services ts
        JOIN service_tags st ON NEW.tag_id = st.id
        WHERE ts.service_id = NEW.service_id
        AND st.is_active = true
        AND NOT EXISTS (
            SELECT 1 FROM ticket_tag_relations ttr 
            WHERE ttr.ticket_id = ts.ticket_id 
            AND ttr.tag_id = NEW.tag_id
        );
        
        GET DIAGNOSTICS affected_tickets = ROW_COUNT;
        
        IF affected_tickets > 0 THEN
            RAISE NOTICE 'Tag agregada a servicio: % tickets actualizados', affected_tickets;
        END IF;
        
        RETURN NEW;
    END IF;
    
    -- DELETE: Cuando se elimina una tag de un servicio
    IF TG_OP = 'DELETE' THEN
        -- Eliminar la tag de tickets que solo la tenían por este servicio
        DELETE FROM ticket_tag_relations ttr
        WHERE ttr.tag_id = OLD.tag_id
        AND EXISTS (
            SELECT 1 FROM ticket_services ts 
            WHERE ts.ticket_id = ttr.ticket_id 
            AND ts.service_id = OLD.service_id
        )
        AND NOT EXISTS (
            -- Verificar que no hay otros servicios en el ticket con la misma tag
            SELECT 1 FROM ticket_services ts2
            JOIN service_tag_relations str2 ON ts2.service_id = str2.service_id
            WHERE ts2.ticket_id = ttr.ticket_id
            AND str2.tag_id = OLD.tag_id
            AND str2.service_id != OLD.service_id
        );
        
        GET DIAGNOSTICS affected_tickets = ROW_COUNT;
        
        IF affected_tickets > 0 THEN
            RAISE NOTICE 'Tag eliminada de servicio: % tickets actualizados', affected_tickets;
        END IF;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para cambios en service_tag_relations
DROP TRIGGER IF EXISTS trigger_sync_tickets_on_service_tag_change ON service_tag_relations;
CREATE TRIGGER trigger_sync_tickets_on_service_tag_change
    AFTER INSERT OR DELETE ON service_tag_relations
    FOR EACH ROW
    EXECUTE FUNCTION sync_tickets_on_service_tag_change();

-- 6. EJECUCIÓN DE SINCRONIZACIÓN INICIAL
-- ================================================================

DO $$
DECLARE
    sync_result TEXT;
    cleanup_result TEXT;
BEGIN
    RAISE NOTICE 'Iniciando sincronización inicial...';
    RAISE NOTICE '';
    
    -- Limpiar inconsistencias primero
    SELECT cleanup_inconsistent_ticket_tags() INTO cleanup_result;
    RAISE NOTICE '%', cleanup_result;
    
    -- Sincronizar todos los tickets
    SELECT sync_all_ticket_tags_from_services() INTO sync_result;
    RAISE NOTICE '%', sync_result;
    
    RAISE NOTICE '✅ Sincronización inicial completada';
    RAISE NOTICE '';
END $$;
