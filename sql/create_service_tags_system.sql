-- ================================================================
-- SISTEMA DE TAGS PARA SERVICIOS
-- ================================================================

-- 1. Crear tabla service_tags si no existe
CREATE TABLE IF NOT EXISTS service_tags (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#6b7280',
    description TEXT,
    company_id VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Índice único para evitar duplicados por empresa
    CONSTRAINT service_tags_name_company_unique UNIQUE (name, company_id)
);

-- 2. Crear tabla de relación service_tag_relations
CREATE TABLE IF NOT EXISTS service_tag_relations (
    service_id UUID NOT NULL,
    tag_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (service_id, tag_id),
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES service_tags(id) ON DELETE CASCADE
);

-- 3. Crear tags básicos para cada empresa existente
DO $$
DECLARE
    company_record RECORD;
    tag_colors TEXT[] := ARRAY['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];
    tag_names TEXT[] := ARRAY['Hardware', 'Software', 'Reparación', 'Diagnóstico', 'Mantenimiento', 'Instalación', 'Configuración', 'Urgente'];
    i INTEGER;
BEGIN
    -- Para cada empresa, crear tags básicos
    FOR company_record IN 
        SELECT id, name FROM companies WHERE deleted_at IS NULL 
    LOOP
        RAISE NOTICE 'Creando tags básicos para empresa: % (ID: %)', company_record.name, company_record.id;
        
        -- Crear cada tag con su color correspondiente
        FOR i IN 1..array_length(tag_names, 1) LOOP
            INSERT INTO service_tags (name, color, company_id, description)
            VALUES (
                tag_names[i],
                tag_colors[i],
                company_record.id::text,
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
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Tags básicos creados para todas las empresas';
END $$;

-- 4. Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_service_tags_company_active 
ON service_tags(company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_service_tag_relations_service 
ON service_tag_relations(service_id);

CREATE INDEX IF NOT EXISTS idx_service_tag_relations_tag 
ON service_tag_relations(tag_id);

-- 5. Función para sincronizar tags de servicios con tickets
CREATE OR REPLACE FUNCTION sync_ticket_tags_from_services()
RETURNS TRIGGER AS $$
BEGIN
    -- Cuando se crea un ticket_service, sincronizar tags del servicio al ticket
    IF TG_OP = 'INSERT' THEN
        -- Agregar tags del servicio al ticket si no existen
        INSERT INTO ticket_tag_relations (ticket_id, tag_id)
        SELECT 
            NEW.ticket_id,
            str.tag_id
        FROM service_tag_relations str
        JOIN service_tags st ON str.tag_id = st.id
        WHERE str.service_id = NEW.service_id
        AND NOT EXISTS (
            SELECT 1 FROM ticket_tag_relations ttr 
            WHERE ttr.ticket_id = NEW.ticket_id 
            AND ttr.tag_id = str.tag_id
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 6. Crear trigger para sincronización automática
DROP TRIGGER IF EXISTS trigger_sync_ticket_tags_from_services ON ticket_services;
CREATE TRIGGER trigger_sync_ticket_tags_from_services
    AFTER INSERT ON ticket_services
    FOR EACH ROW
    EXECUTE FUNCTION sync_ticket_tags_from_services();

-- 7. Verificar estructura creada
DO $$
DECLARE
    service_tags_count INTEGER;
    service_tag_relations_count INTEGER;
    companies_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO service_tags_count FROM service_tags;
    SELECT COUNT(*) INTO service_tag_relations_count FROM service_tag_relations;
    SELECT COUNT(*) INTO companies_count FROM companies WHERE deleted_at IS NULL;
    
    RAISE NOTICE '=== RESUMEN CREACIÓN SISTEMA SERVICE TAGS ===';
    RAISE NOTICE 'Empresas procesadas: %', companies_count;
    RAISE NOTICE 'Service tags creados: %', service_tags_count;
    RAISE NOTICE 'Relaciones existentes: %', service_tag_relations_count;
    RAISE NOTICE 'Sistema de service tags configurado correctamente';
END $$;