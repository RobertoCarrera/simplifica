-- ================================================================
-- SCRIPT PARA ASEGURAR QUE CADA TICKET TENGA AL MENOS 1 SERVICIO
-- ================================================================
-- Este script verifica y corrige que todos los tickets tengan servicios asociados

-- ================================================================
-- PARTE 1: VERIFICACIÓN INICIAL
-- ================================================================

-- Contar tickets sin servicios asociados
DO $$
DECLARE
    tickets_sin_servicios integer;
    tickets_total integer;
BEGIN
    -- Verificar si existe la tabla ticket_services
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ticket_services') THEN
        RAISE NOTICE 'Creando tabla ticket_services...';
        
        -- Crear tabla de relación tickets-servicios si no existe
        CREATE TABLE ticket_services (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            ticket_id uuid NOT NULL,
            service_id uuid NOT NULL,
            quantity integer DEFAULT 1,
            price_per_unit numeric(10,2),
            total_price numeric(10,2),
            created_at timestamp with time zone DEFAULT now(),
            updated_at timestamp with time zone DEFAULT now(),
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
            FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
            UNIQUE(ticket_id, service_id)
        );
        
        RAISE NOTICE 'Tabla ticket_services creada exitosamente';
    END IF;
    
    -- Contar tickets totales
    SELECT COUNT(*) INTO tickets_total FROM tickets;
    
    -- Contar tickets sin servicios asociados
    SELECT COUNT(*) INTO tickets_sin_servicios 
    FROM tickets t 
    LEFT JOIN ticket_services ts ON t.id = ts.ticket_id 
    WHERE ts.ticket_id IS NULL;
    
    RAISE NOTICE 'Tickets totales: %', tickets_total;
    RAISE NOTICE 'Tickets sin servicios: %', tickets_sin_servicios;
    
    IF tickets_sin_servicios = 0 THEN
        RAISE NOTICE 'Todos los tickets ya tienen servicios asociados ✓';
    ELSE
        RAISE NOTICE 'Se necesita corregir % tickets sin servicios', tickets_sin_servicios;
    END IF;
END $$;

-- ================================================================
-- PARTE 2: CREAR SERVICIOS BÁSICOS SI NO EXISTEN
-- ================================================================

-- Asegurar índice único para poder usar ON CONFLICT (name, company_id)
-- (algunos despliegues no tenían esta constraint/index y Postgres lanza 42P10)
CREATE UNIQUE INDEX IF NOT EXISTS services_name_company_unique_idx
    ON services (name, company_id);


-- Insertar servicios básicos para cada empresa
DO $$
DECLARE
    company_record RECORD;
    servicio_diagnostico_id uuid;
    servicio_reparacion_id uuid;
    servicio_mantenimiento_id uuid;
    servicio_instalacion_id uuid;
    servicio_configuracion_id uuid;
BEGIN
    -- Para cada empresa, crear servicios básicos si no existen
    FOR company_record IN SELECT id, name FROM companies WHERE deleted_at IS NULL LOOP
        RAISE NOTICE 'Procesando empresa: % (ID: %)', company_record.name, company_record.id;
        
        -- Servicio 1: Diagnóstico
        INSERT INTO services (name, description, base_price, estimated_hours, company_id, is_active)
        VALUES (
            'Diagnóstico Técnico',
            'Evaluación completa del problema del dispositivo',
            25.00,
            1.0,
            company_record.id,
            true
        )
        ON CONFLICT (name, company_id) DO NOTHING
        RETURNING id INTO servicio_diagnostico_id;
        
        -- Obtener ID si ya existía
        IF servicio_diagnostico_id IS NULL THEN
            SELECT id INTO servicio_diagnostico_id 
            FROM services 
            WHERE name = 'Diagnóstico Técnico' AND company_id = company_record.id;
        END IF;
        
        -- Servicio 2: Reparación
        INSERT INTO services (name, description, base_price, estimated_hours, company_id, is_active)
        VALUES (
            'Reparación General',
            'Reparación de componentes hardware y software',
            75.00,
            2.5,
            company_record.id,
            true
        )
        ON CONFLICT (name, company_id) DO NOTHING
        RETURNING id INTO servicio_reparacion_id;
        
        IF servicio_reparacion_id IS NULL THEN
            SELECT id INTO servicio_reparacion_id 
            FROM services 
            WHERE name = 'Reparación General' AND company_id = company_record.id;
        END IF;
        
        -- Servicio 3: Mantenimiento
        INSERT INTO services (name, description, base_price, estimated_hours, company_id, is_active)
        VALUES (
            'Mantenimiento Preventivo',
            'Limpieza y optimización del sistema',
            35.00,
            1.5,
            company_record.id,
            true
        )
        ON CONFLICT (name, company_id) DO NOTHING
        RETURNING id INTO servicio_mantenimiento_id;
        
        IF servicio_mantenimiento_id IS NULL THEN
            SELECT id INTO servicio_mantenimiento_id 
            FROM services 
            WHERE name = 'Mantenimiento Preventivo' AND company_id = company_record.id;
        END IF;
        
        -- Servicio 4: Instalación
        INSERT INTO services (name, description, base_price, estimated_hours, company_id, is_active)
        VALUES (
            'Instalación de Software',
            'Instalación y configuración de aplicaciones',
            40.00,
            1.0,
            company_record.id,
            true
        )
        ON CONFLICT (name, company_id) DO NOTHING
        RETURNING id INTO servicio_instalacion_id;
        
        IF servicio_instalacion_id IS NULL THEN
            SELECT id INTO servicio_instalacion_id 
            FROM services 
            WHERE name = 'Instalación de Software' AND company_id = company_record.id;
        END IF;
        
        -- Servicio 5: Configuración
        INSERT INTO services (name, description, base_price, estimated_hours, company_id, is_active)
        VALUES (
            'Configuración de Red',
            'Configuración de conectividad y redes',
            50.00,
            2.0,
            company_record.id,
            true
        )
        ON CONFLICT (name, company_id) DO NOTHING
        RETURNING id INTO servicio_configuracion_id;
        
        IF servicio_configuracion_id IS NULL THEN
            SELECT id INTO servicio_configuracion_id 
            FROM services 
            WHERE name = 'Configuración de Red' AND company_id = company_record.id;
        END IF;
        
        RAISE NOTICE 'Servicios básicos verificados/creados para empresa %', company_record.name;
    END LOOP;
END $$;

-- ================================================================
-- PARTE 3: ASIGNAR SERVICIOS A TICKETS SIN SERVICIOS
-- ================================================================

DO $$
DECLARE
    ticket_record RECORD;
    servicio_asignado_id uuid;
    servicio_precio numeric(10,2);
    servicio_horas numeric(4,2);
    tickets_corregidos integer := 0;
BEGIN
    RAISE NOTICE 'Iniciando asignación de servicios a tickets sin servicios...';
    
    -- Para cada ticket sin servicios
    FOR ticket_record IN 
        SELECT DISTINCT t.id, t.title, t.description, t.company_id, t.total_amount
        FROM tickets t 
        LEFT JOIN ticket_services ts ON t.id = ts.ticket_id 
        WHERE ts.ticket_id IS NULL
    LOOP
        -- Seleccionar servicio apropiado basado en el título/descripción
        IF ticket_record.title ILIKE '%diagnóstico%' OR ticket_record.description ILIKE '%diagnóstico%' THEN
            SELECT id, base_price, estimated_hours INTO servicio_asignado_id, servicio_precio, servicio_horas
            FROM services 
            WHERE company_id = ticket_record.company_id 
            AND name = 'Diagnóstico Técnico' 
            AND is_active = true 
            LIMIT 1;
            
        ELSIF ticket_record.title ILIKE '%reparación%' OR ticket_record.description ILIKE '%reparar%' 
              OR ticket_record.title ILIKE '%repair%' THEN
            SELECT id, base_price, estimated_hours INTO servicio_asignado_id, servicio_precio, servicio_horas
            FROM services 
            WHERE company_id = ticket_record.company_id 
            AND name = 'Reparación General' 
            AND is_active = true 
            LIMIT 1;
            
        ELSIF ticket_record.title ILIKE '%mantenimiento%' OR ticket_record.description ILIKE '%mantener%' 
              OR ticket_record.title ILIKE '%limpieza%' THEN
            SELECT id, base_price, estimated_hours INTO servicio_asignado_id, servicio_precio, servicio_horas
            FROM services 
            WHERE company_id = ticket_record.company_id 
            AND name = 'Mantenimiento Preventivo' 
            AND is_active = true 
            LIMIT 1;
            
        ELSIF ticket_record.title ILIKE '%instalación%' OR ticket_record.description ILIKE '%instalar%' 
              OR ticket_record.title ILIKE '%software%' THEN
            SELECT id, base_price, estimated_hours INTO servicio_asignado_id, servicio_precio, servicio_horas
            FROM services 
            WHERE company_id = ticket_record.company_id 
            AND name = 'Instalación de Software' 
            AND is_active = true 
            LIMIT 1;
            
        ELSIF ticket_record.title ILIKE '%red%' OR ticket_record.description ILIKE '%red%' 
              OR ticket_record.title ILIKE '%wifi%' OR ticket_record.title ILIKE '%configuración%' THEN
            SELECT id, base_price, estimated_hours INTO servicio_asignado_id, servicio_precio, servicio_horas
            FROM services 
            WHERE company_id = ticket_record.company_id 
            AND name = 'Configuración de Red' 
            AND is_active = true 
            LIMIT 1;
        ELSE
            -- Por defecto, asignar Diagnóstico Técnico
            SELECT id, base_price, estimated_hours INTO servicio_asignado_id, servicio_precio, servicio_horas
            FROM services 
            WHERE company_id = ticket_record.company_id 
            AND name = 'Diagnóstico Técnico' 
            AND is_active = true 
            LIMIT 1;
        END IF;
        
        -- Si no se encontró un servicio específico, tomar cualquier servicio activo de la empresa
        IF servicio_asignado_id IS NULL THEN
            SELECT id, base_price, estimated_hours INTO servicio_asignado_id, servicio_precio, servicio_horas
            FROM services 
            WHERE company_id = ticket_record.company_id 
            AND is_active = true 
            ORDER BY base_price ASC 
            LIMIT 1;
        END IF;
        
        -- Si aún no hay servicio, crear uno genérico
        IF servicio_asignado_id IS NULL THEN
            INSERT INTO services (name, description, base_price, estimated_hours, company_id, is_active)
            VALUES (
                'Servicio Técnico General',
                'Servicio técnico general para soporte y reparación',
                50.00,
                2.0,
                ticket_record.company_id,
                true
            )
            RETURNING id, base_price, estimated_hours INTO servicio_asignado_id, servicio_precio, servicio_horas;
            
            RAISE NOTICE 'Creado servicio genérico para ticket % (empresa %)', ticket_record.id, ticket_record.company_id;
        END IF;
        
        -- Asignar el servicio al ticket
        INSERT INTO ticket_services (ticket_id, service_id, quantity, price_per_unit, total_price)
        VALUES (
            ticket_record.id,
            servicio_asignado_id,
            1,
            servicio_precio,
            servicio_precio
        );
        
        -- Actualizar las horas estimadas del ticket si no las tiene
        -- Hacemos esto de forma defensiva porque algunos despliegues usan otro nombre de columna
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'estimated_hours') THEN
            UPDATE tickets
            SET estimated_hours = COALESCE(estimated_hours, servicio_horas),
                updated_at = now()
            WHERE id = ticket_record.id
            AND estimated_hours IS NULL;

        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'estimated_time_hours') THEN
            -- alternativa común
            UPDATE tickets
            SET estimated_time_hours = COALESCE(estimated_time_hours, servicio_horas),
                updated_at = now()
            WHERE id = ticket_record.id
            AND estimated_time_hours IS NULL;

        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'estimated') THEN
            -- otra alternativa posible
            UPDATE tickets
            SET estimated = COALESCE(estimated, servicio_horas),
                updated_at = now()
            WHERE id = ticket_record.id
            AND estimated IS NULL;

        ELSE
            RAISE NOTICE 'Columna de horas estimadas no encontrada en tabla tickets, omitiendo actualización de horas para ticket %', ticket_record.id;
        END IF;
        
        tickets_corregidos := tickets_corregidos + 1;
        
        RAISE NOTICE 'Ticket % asignado servicio % (precio: %)', 
                     ticket_record.id, servicio_asignado_id, servicio_precio;
    END LOOP;
    
    RAISE NOTICE 'Tickets corregidos: %', tickets_corregidos;
END $$;

-- ================================================================
-- PARTE 5: ASEGURAR QUE CADA TICKET TENGA AL MENOS 2 TAGS
-- ================================================================

DO $$
DECLARE
    has_company_col boolean;
    has_is_active boolean;
    has_color boolean;
    company_record RECORD;
    tag_urgente_id uuid;
    tag_hardware_id uuid;
    tag_software_id uuid;
    tag_reparacion_id uuid;
    tag_diagnostico_id uuid;
    tag_mantenimiento_id uuid;
    tag_instalacion_id uuid;
    tag_configuracion_id uuid;
    v_sql text;
BEGIN
    -- Comprobar si las columnas existen en ticket_tags
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_tags' AND column_name = 'company_id'
    ) INTO has_company_col;

    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_tags' AND column_name = 'is_active'
    ) INTO has_is_active;

    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_tags' AND column_name = 'color'
    ) INTO has_color;

    -- Crear índice único apropiado según existencia de columna
    IF has_company_col THEN
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ticket_tags_name_company_unique_idx ON ticket_tags (name, company_id)';
    ELSE
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ticket_tags_name_unique_idx ON ticket_tags (name)';
    END IF;

    RAISE NOTICE 'Iniciando creación de tags básicos (has_company_col=%, has_is_active=%, has_color=%).', has_company_col, has_is_active, has_color;

    IF has_company_col THEN
        -- Para cada empresa, crear tags básicos si no existen
        FOR company_record IN SELECT id, name FROM companies WHERE deleted_at IS NULL LOOP
            RAISE NOTICE 'Procesando tags para empresa: % (ID: %)', company_record.name, company_record.id;

            -- Urgente
            IF has_color AND has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id, is_active) VALUES (%L, %L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Urgente', '#ef4444', company_record.id, true);
            ELSIF has_color THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Urgente', '#ef4444', company_record.id);
            ELSIF has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, company_id, is_active) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Urgente', company_record.id, true);
            ELSE
                v_sql := format('INSERT INTO ticket_tags (name, company_id) VALUES (%L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Urgente', company_record.id);
            END IF;
            EXECUTE v_sql INTO tag_urgente_id;
            IF tag_urgente_id IS NULL THEN
                IF has_company_col THEN
                    EXECUTE format('SELECT id FROM ticket_tags WHERE name = %L AND company_id = %L LIMIT 1', 'Urgente', company_record.id) INTO tag_urgente_id;
                ELSE
                    EXECUTE format('SELECT id FROM ticket_tags WHERE name = %L LIMIT 1', 'Urgente') INTO tag_urgente_id;
                END IF;
            END IF;

            -- Hardware
            IF has_color AND has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id, is_active) VALUES (%L, %L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Hardware', '#3b82f6', company_record.id, true);
            ELSIF has_color THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Hardware', '#3b82f6', company_record.id);
            ELSIF has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, company_id, is_active) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Hardware', company_record.id, true);
            ELSE
                v_sql := format('INSERT INTO ticket_tags (name, company_id) VALUES (%L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Hardware', company_record.id);
            END IF;
            EXECUTE v_sql INTO tag_hardware_id;
            IF tag_hardware_id IS NULL THEN
                EXECUTE format('SELECT id FROM ticket_tags WHERE name = %L AND company_id = %L LIMIT 1', 'Hardware', company_record.id) INTO tag_hardware_id;
            END IF;

            -- Software
            IF has_color AND has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id, is_active) VALUES (%L, %L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Software', '#10b981', company_record.id, true);
            ELSIF has_color THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Software', '#10b981', company_record.id);
            ELSIF has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, company_id, is_active) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Software', company_record.id, true);
            ELSE
                v_sql := format('INSERT INTO ticket_tags (name, company_id) VALUES (%L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Software', company_record.id);
            END IF;
            EXECUTE v_sql INTO tag_software_id;
            IF tag_software_id IS NULL THEN
                EXECUTE format('SELECT id FROM ticket_tags WHERE name = %L AND company_id = %L LIMIT 1', 'Software', company_record.id) INTO tag_software_id;
            END IF;

            -- Reparación
            IF has_color AND has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id, is_active) VALUES (%L, %L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Reparación', '#f59e0b', company_record.id, true);
            ELSIF has_color THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Reparación', '#f59e0b', company_record.id);
            ELSIF has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, company_id, is_active) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Reparación', company_record.id, true);
            ELSE
                v_sql := format('INSERT INTO ticket_tags (name, company_id) VALUES (%L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Reparación', company_record.id);
            END IF;
            EXECUTE v_sql INTO tag_reparacion_id;
            IF tag_reparacion_id IS NULL THEN
                EXECUTE format('SELECT id FROM ticket_tags WHERE name = %L AND company_id = %L LIMIT 1', 'Reparación', company_record.id) INTO tag_reparacion_id;
            END IF;

            -- Diagnóstico
            IF has_color AND has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id, is_active) VALUES (%L, %L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Diagnóstico', '#8b5cf6', company_record.id, true);
            ELSIF has_color THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Diagnóstico', '#8b5cf6', company_record.id);
            ELSIF has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, company_id, is_active) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Diagnóstico', company_record.id, true);
            ELSE
                v_sql := format('INSERT INTO ticket_tags (name, company_id) VALUES (%L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Diagnóstico', company_record.id);
            END IF;
            EXECUTE v_sql INTO tag_diagnostico_id;
            IF tag_diagnostico_id IS NULL THEN
                EXECUTE format('SELECT id FROM ticket_tags WHERE name = %L AND company_id = %L LIMIT 1', 'Diagnóstico', company_record.id) INTO tag_diagnostico_id;
            END IF;

            -- Mantenimiento
            IF has_color AND has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id, is_active) VALUES (%L, %L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Mantenimiento', '#06b6d4', company_record.id, true);
            ELSIF has_color THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Mantenimiento', '#06b6d4', company_record.id);
            ELSIF has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, company_id, is_active) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Mantenimiento', company_record.id, true);
            ELSE
                v_sql := format('INSERT INTO ticket_tags (name, company_id) VALUES (%L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Mantenimiento', company_record.id);
            END IF;
            EXECUTE v_sql INTO tag_mantenimiento_id;
            IF tag_mantenimiento_id IS NULL THEN
                EXECUTE format('SELECT id FROM ticket_tags WHERE name = %L AND company_id = %L LIMIT 1', 'Mantenimiento', company_record.id) INTO tag_mantenimiento_id;
            END IF;

            -- Instalación
            IF has_color AND has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id, is_active) VALUES (%L, %L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Instalación', '#84cc16', company_record.id, true);
            ELSIF has_color THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Instalación', '#84cc16', company_record.id);
            ELSIF has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, company_id, is_active) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Instalación', company_record.id, true);
            ELSE
                v_sql := format('INSERT INTO ticket_tags (name, company_id) VALUES (%L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Instalación', company_record.id);
            END IF;
            EXECUTE v_sql INTO tag_instalacion_id;
            IF tag_instalacion_id IS NULL THEN
                EXECUTE format('SELECT id FROM ticket_tags WHERE name = %L AND company_id = %L LIMIT 1', 'Instalación', company_record.id) INTO tag_instalacion_id;
            END IF;

            -- Configuración
            IF has_color AND has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id, is_active) VALUES (%L, %L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Configuración', '#f97316', company_record.id, true);
            ELSIF has_color THEN
                v_sql := format('INSERT INTO ticket_tags (name, color, company_id) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Configuración', '#f97316', company_record.id);
            ELSIF has_is_active THEN
                v_sql := format('INSERT INTO ticket_tags (name, company_id, is_active) VALUES (%L, %L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Configuración', company_record.id, true);
            ELSE
                v_sql := format('INSERT INTO ticket_tags (name, company_id) VALUES (%L, %L) ON CONFLICT (name, company_id) DO NOTHING RETURNING id', 'Configuración', company_record.id);
            END IF;
            EXECUTE v_sql INTO tag_configuracion_id;
            IF tag_configuracion_id IS NULL THEN
                EXECUTE format('SELECT id FROM ticket_tags WHERE name = %L AND company_id = %L LIMIT 1', 'Configuración', company_record.id) INTO tag_configuracion_id;
            END IF;

            RAISE NOTICE 'Tags básicos verificados/creados para empresa %', company_record.name;
        END LOOP;
    ELSE
        -- Crear tags globales (sin company_id)
        RAISE NOTICE 'Creando tags globales (ticket_tags no tiene company_id)';

        IF has_color AND has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, color, is_active) VALUES (''Urgente'', ''#ef4444'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_color THEN
            v_sql := 'INSERT INTO ticket_tags (name, color) VALUES (''Urgente'', ''#ef4444'') ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, is_active) VALUES (''Urgente'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSE
            v_sql := 'INSERT INTO ticket_tags (name) VALUES (''Urgente'') ON CONFLICT (name) DO NOTHING RETURNING id';
        END IF;
        EXECUTE v_sql INTO tag_urgente_id;

        IF has_color AND has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, color, is_active) VALUES (''Hardware'', ''#3b82f6'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_color THEN
            v_sql := 'INSERT INTO ticket_tags (name, color) VALUES (''Hardware'', ''#3b82f6'') ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, is_active) VALUES (''Hardware'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSE
            v_sql := 'INSERT INTO ticket_tags (name) VALUES (''Hardware'') ON CONFLICT (name) DO NOTHING RETURNING id';
        END IF;
        EXECUTE v_sql INTO tag_hardware_id;

        IF has_color AND has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, color, is_active) VALUES (''Software'', ''#10b981'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_color THEN
            v_sql := 'INSERT INTO ticket_tags (name, color) VALUES (''Software'', ''#10b981'') ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, is_active) VALUES (''Software'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSE
            v_sql := 'INSERT INTO ticket_tags (name) VALUES (''Software'') ON CONFLICT (name) DO NOTHING RETURNING id';
        END IF;
        EXECUTE v_sql INTO tag_software_id;

        IF has_color AND has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, color, is_active) VALUES (''Reparación'', ''#f59e0b'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_color THEN
            v_sql := 'INSERT INTO ticket_tags (name, color) VALUES (''Reparación'', ''#f59e0b'') ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, is_active) VALUES (''Reparación'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSE
            v_sql := 'INSERT INTO ticket_tags (name) VALUES (''Reparación'') ON CONFLICT (name) DO NOTHING RETURNING id';
        END IF;
        EXECUTE v_sql INTO tag_reparacion_id;

        IF has_color AND has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, color, is_active) VALUES (''Diagnóstico'', ''#8b5cf6'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_color THEN
            v_sql := 'INSERT INTO ticket_tags (name, color) VALUES (''Diagnóstico'', ''#8b5cf6'') ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, is_active) VALUES (''Diagnóstico'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSE
            v_sql := 'INSERT INTO ticket_tags (name) VALUES (''Diagnóstico'') ON CONFLICT (name) DO NOTHING RETURNING id';
        END IF;
        EXECUTE v_sql INTO tag_diagnostico_id;

        IF has_color AND has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, color, is_active) VALUES (''Mantenimiento'', ''#06b6d4'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_color THEN
            v_sql := 'INSERT INTO ticket_tags (name, color) VALUES (''Mantenimiento'', ''#06b6d4'') ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, is_active) VALUES (''Mantenimiento'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSE
            v_sql := 'INSERT INTO ticket_tags (name) VALUES (''Mantenimiento'') ON CONFLICT (name) DO NOTHING RETURNING id';
        END IF;
        EXECUTE v_sql INTO tag_mantenimiento_id;

        IF has_color AND has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, color, is_active) VALUES (''Instalación'', ''#84cc16'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_color THEN
            v_sql := 'INSERT INTO ticket_tags (name, color) VALUES (''Instalación'', ''#84cc16'') ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, is_active) VALUES (''Instalación'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSE
            v_sql := 'INSERT INTO ticket_tags (name) VALUES (''Instalación'') ON CONFLICT (name) DO NOTHING RETURNING id';
        END IF;
        EXECUTE v_sql INTO tag_instalacion_id;

        IF has_color AND has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, color, is_active) VALUES (''Configuración'', ''#f97316'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_color THEN
            v_sql := 'INSERT INTO ticket_tags (name, color) VALUES (''Configuración'', ''#f97316'') ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSIF has_is_active THEN
            v_sql := 'INSERT INTO ticket_tags (name, is_active) VALUES (''Configuración'', true) ON CONFLICT (name) DO NOTHING RETURNING id';
        ELSE
            v_sql := 'INSERT INTO ticket_tags (name) VALUES (''Configuración'') ON CONFLICT (name) DO NOTHING RETURNING id';
        END IF;
        EXECUTE v_sql INTO tag_configuracion_id;

        RAISE NOTICE 'Tags globales verificados/creados';
    END IF;
END $$;

-- ================================================================
-- PARTE 6: ASIGNAR TAGS A TICKETS SIN TAGS O CON MENOS DE 2 TAGS
-- ================================================================

DO $$
DECLARE
    ticket_record RECORD;
    current_tag_count integer;
    tag_primary_id uuid;
    tag_secondary_id uuid;
    tickets_sin_tags integer := 0;
    tickets_corregidos_tags integer := 0;
    has_company_col boolean := false;
BEGIN
    -- Detect if ticket_tags has company_id column to adapt queries
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_tags' AND column_name = 'company_id'
    ) INTO has_company_col;

    RAISE NOTICE 'PARTE 6: ticket_tags has company_id = %', has_company_col;
    RAISE NOTICE 'Iniciando asignación de tags a tickets...';
    
    -- Contar tickets sin tags o con menos de 2
    SELECT COUNT(*) INTO tickets_sin_tags
    FROM tickets t
    WHERE (
        SELECT COUNT(*) FROM ticket_tag_relations ttr 
        WHERE ttr.ticket_id = t.id
    ) < 2;
    
    RAISE NOTICE 'Tickets con menos de 2 tags: %', tickets_sin_tags;
    
    -- Para cada ticket que necesita tags
    FOR ticket_record IN 
        SELECT DISTINCT t.id, t.title, t.description, t.company_id, t.priority
        FROM tickets t 
        WHERE (
            SELECT COUNT(*) FROM ticket_tag_relations ttr 
            WHERE ttr.ticket_id = t.id
        ) < 2
    LOOP
    -- Contar tags actuales del ticket
    SELECT COUNT(*) INTO current_tag_count 
    FROM ticket_tag_relations 
    WHERE ticket_id = ticket_record.id;
        
        -- Asignar tags apropiados basado en el contenido
        -- Tag primario basado en título/descripción
        IF ticket_record.title ILIKE '%hardware%' OR ticket_record.description ILIKE '%hardware%' 
           OR ticket_record.title ILIKE '%disco%' OR ticket_record.title ILIKE '%memoria%' THEN
            IF has_company_col THEN
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE company_id = ticket_record.company_id AND name = 'Hardware' LIMIT 1;
            ELSE
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE name = 'Hardware' LIMIT 1;
            END IF;
            
        ELSIF ticket_record.title ILIKE '%software%' OR ticket_record.description ILIKE '%software%' 
              OR ticket_record.title ILIKE '%programa%' OR ticket_record.title ILIKE '%aplicación%' THEN
            IF has_company_col THEN
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE company_id = ticket_record.company_id AND name = 'Software' LIMIT 1;
            ELSE
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE name = 'Software' LIMIT 1;
            END IF;
            
        ELSIF ticket_record.title ILIKE '%reparación%' OR ticket_record.description ILIKE '%reparar%' 
              OR ticket_record.title ILIKE '%arreglar%' THEN
            IF has_company_col THEN
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE company_id = ticket_record.company_id AND name = 'Reparación' LIMIT 1;
            ELSE
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE name = 'Reparación' LIMIT 1;
            END IF;
            
        ELSIF ticket_record.title ILIKE '%diagnóstico%' OR ticket_record.description ILIKE '%diagnóstico%' THEN
            IF has_company_col THEN
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE company_id = ticket_record.company_id AND name = 'Diagnóstico' LIMIT 1;
            ELSE
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE name = 'Diagnóstico' LIMIT 1;
            END IF;
            
        ELSIF ticket_record.title ILIKE '%mantenimiento%' OR ticket_record.description ILIKE '%mantener%' THEN
            IF has_company_col THEN
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE company_id = ticket_record.company_id AND name = 'Mantenimiento' LIMIT 1;
            ELSE
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE name = 'Mantenimiento' LIMIT 1;
            END IF;
            
        ELSIF ticket_record.title ILIKE '%instalación%' OR ticket_record.description ILIKE '%instalar%' THEN
            IF has_company_col THEN
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE company_id = ticket_record.company_id AND name = 'Instalación' LIMIT 1;
            ELSE
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE name = 'Instalación' LIMIT 1;
            END IF;
            
        ELSIF ticket_record.title ILIKE '%configuración%' OR ticket_record.description ILIKE '%configurar%' THEN
            IF has_company_col THEN
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE company_id = ticket_record.company_id AND name = 'Configuración' LIMIT 1;
            ELSE
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE name = 'Configuración' LIMIT 1;
            END IF;
            
        ELSE
            -- Por defecto, asignar Hardware
            IF has_company_col THEN
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE company_id = ticket_record.company_id AND name = 'Hardware' LIMIT 1;
            ELSE
                SELECT id INTO tag_primary_id FROM ticket_tags 
                WHERE name = 'Hardware' LIMIT 1;
            END IF;
        END IF;
        
        -- Tag secundario basado en prioridad o contexto
        IF ticket_record.priority = 'critical' OR ticket_record.priority = 'high' THEN
            IF has_company_col THEN
                SELECT id INTO tag_secondary_id FROM ticket_tags 
                WHERE company_id = ticket_record.company_id AND name = 'Urgente' LIMIT 1;
            ELSE
                SELECT id INTO tag_secondary_id FROM ticket_tags 
                WHERE name = 'Urgente' LIMIT 1;
            END IF;
        ELSE
            -- Asignar un tag complementario diferente al primario
            IF has_company_col THEN
                IF tag_primary_id = (SELECT id FROM ticket_tags WHERE company_id = ticket_record.company_id AND name = 'Hardware' LIMIT 1) THEN
                    SELECT id INTO tag_secondary_id FROM ticket_tags 
                    WHERE company_id = ticket_record.company_id AND name = 'Reparación' LIMIT 1;
                ELSE
                    SELECT id INTO tag_secondary_id FROM ticket_tags 
                    WHERE company_id = ticket_record.company_id AND name = 'Hardware' LIMIT 1;
                END IF;
            ELSE
                IF tag_primary_id = (SELECT id FROM ticket_tags WHERE name = 'Hardware' LIMIT 1) THEN
                    SELECT id INTO tag_secondary_id FROM ticket_tags 
                    WHERE name = 'Reparación' LIMIT 1;
                ELSE
                    SELECT id INTO tag_secondary_id FROM ticket_tags 
                    WHERE name = 'Hardware' LIMIT 1;
                END IF;
            END IF;
        END IF;
        
        -- Insertar tag primario si no existe
        IF tag_primary_id IS NOT NULL THEN
            INSERT INTO ticket_tag_relations (ticket_id, tag_id)
            VALUES (ticket_record.id, tag_primary_id)
            ON CONFLICT (ticket_id, tag_id) DO NOTHING;
        END IF;
        
        -- Insertar tag secundario si no existe y es diferente al primario
        IF tag_secondary_id IS NOT NULL AND tag_secondary_id != tag_primary_id THEN
            INSERT INTO ticket_tag_relations (ticket_id, tag_id)
            VALUES (ticket_record.id, tag_secondary_id)
            ON CONFLICT (ticket_id, tag_id) DO NOTHING;
        END IF;
        
        -- Si aún no tenemos 2 tags, agregar uno más genérico
        SELECT COUNT(*) INTO current_tag_count 
        FROM ticket_tag_relations 
        WHERE ticket_id = ticket_record.id;
        
        IF current_tag_count < 2 THEN
            -- Buscar cualquier tag que no esté ya asignado (adaptado a company_id si existe)
            IF has_company_col THEN
                SELECT id INTO tag_secondary_id FROM ticket_tags 
                WHERE company_id = ticket_record.company_id 
                AND id NOT IN (
                    SELECT tag_id FROM ticket_tag_relations 
                    WHERE ticket_id = ticket_record.id
                )
                LIMIT 1;
            ELSE
                SELECT id INTO tag_secondary_id FROM ticket_tags 
                WHERE id NOT IN (
                    SELECT tag_id FROM ticket_tag_relations 
                    WHERE ticket_id = ticket_record.id
                )
                LIMIT 1;
            END IF;
            
            IF tag_secondary_id IS NOT NULL THEN
                INSERT INTO ticket_tag_relations (ticket_id, tag_id)
                VALUES (ticket_record.id, tag_secondary_id)
                ON CONFLICT (ticket_id, tag_id) DO NOTHING;
            END IF;
        END IF;
        
        tickets_corregidos_tags := tickets_corregidos_tags + 1;
        
        RAISE NOTICE 'Ticket % asignado tags (primario: %, secundario: %)', 
                     ticket_record.id, tag_primary_id, tag_secondary_id;
    END LOOP;
    
    RAISE NOTICE 'Tickets corregidos con tags: %', tickets_corregidos_tags;
END $$;

-- ================================================================
-- PARTE 7: VERIFICACIÓN FINAL Y ESTADÍSTICAS
-- ================================================================

DO $$
DECLARE
    tickets_sin_servicios_final integer;
    tickets_sin_tags_final integer;
    tickets_total_final integer;
    servicios_total integer;
    tags_total integer;
    has_tag_is_active boolean := false;
    relaciones_servicios_total integer;
    relaciones_tags_total integer;
BEGIN
    -- Contar nuevamente
    SELECT COUNT(*) INTO tickets_total_final FROM tickets;
    SELECT COUNT(*) INTO servicios_total FROM services WHERE is_active = true;
    -- Detectar si ticket_tags tiene columna is_active
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_tags' AND column_name = 'is_active'
    ) INTO has_tag_is_active;

    IF has_tag_is_active THEN
        SELECT COUNT(*) INTO tags_total FROM ticket_tags WHERE is_active = true;
    ELSE
        -- si no existe la columna, contar todos los tags
        SELECT COUNT(*) INTO tags_total FROM ticket_tags;
    END IF;
    SELECT COUNT(*) INTO relaciones_servicios_total FROM ticket_services;
    SELECT COUNT(*) INTO relaciones_tags_total FROM ticket_tag_relations;
    
    SELECT COUNT(*) INTO tickets_sin_servicios_final 
    FROM tickets t 
    LEFT JOIN ticket_services ts ON t.id = ts.ticket_id 
    WHERE ts.ticket_id IS NULL;
    
    SELECT COUNT(*) INTO tickets_sin_tags_final
    FROM tickets t
    WHERE (
        SELECT COUNT(*) FROM ticket_tag_relations ttr 
        WHERE ttr.ticket_id = t.id
    ) < 2;
    
    RAISE NOTICE '';
    RAISE NOTICE '===============================================';
    RAISE NOTICE '         VERIFICACIÓN COMPLETADA             ';
    RAISE NOTICE '===============================================';
    RAISE NOTICE 'Tickets totales: %', tickets_total_final;
    RAISE NOTICE 'Servicios activos: %', servicios_total;
    RAISE NOTICE 'Tags activos: %', tags_total;
    RAISE NOTICE 'Relaciones ticket-servicio: %', relaciones_servicios_total;
    RAISE NOTICE 'Relaciones ticket-tag: %', relaciones_tags_total;
    RAISE NOTICE 'Tickets sin servicios: %', tickets_sin_servicios_final;
    RAISE NOTICE 'Tickets con menos de 2 tags: %', tickets_sin_tags_final;
    
    IF tickets_sin_servicios_final = 0 THEN
        RAISE NOTICE '✓ ÉXITO: Todos los tickets tienen servicios asociados';
    ELSE
        RAISE NOTICE '✗ ERROR: Aún hay % tickets sin servicios', tickets_sin_servicios_final;
    END IF;
    
    IF tickets_sin_tags_final = 0 THEN
        RAISE NOTICE '✓ ÉXITO: Todos los tickets tienen al menos 2 tags';
    ELSE
        RAISE NOTICE '✗ ERROR: Aún hay % tickets con menos de 2 tags', tickets_sin_tags_final;
    END IF;
    
    RAISE NOTICE '===============================================';
END $$;

-- ================================================================
-- CONSULTAS DE VERIFICACIÓN
-- ================================================================

-- Mostrar tickets con sus servicios y tags
SELECT 
    'TICKETS CON SERVICIOS Y TAGS' as info,
    t.id,
    LEFT(t.title, 30) as titulo,
    c.name as empresa,
    s.name as servicio,
    ts.quantity as cantidad_servicio,
    ts.total_price as precio_total,
    STRING_AGG(DISTINCT tag.name, ', ') as tags
FROM tickets t
JOIN companies c ON t.company_id = c.id
LEFT JOIN ticket_services ts ON t.id = ts.ticket_id
LEFT JOIN services s ON ts.service_id = s.id
LEFT JOIN ticket_tag_relations ttr ON t.id = ttr.ticket_id
LEFT JOIN ticket_tags tag ON ttr.tag_id = tag.id
GROUP BY t.id, t.title, c.name, s.name, ts.quantity, ts.total_price
ORDER BY t.created_at DESC
LIMIT 20;

-- Mostrar servicios por empresa
SELECT 
    'SERVICIOS POR EMPRESA' as info,
    c.name as empresa,
    COUNT(s.id) as total_servicios,
    AVG(s.base_price) as precio_promedio,
    SUM(CASE WHEN s.is_active THEN 1 ELSE 0 END) as servicios_activos
FROM companies c
LEFT JOIN services s ON c.id = s.company_id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name
ORDER BY c.name;

-- Mostrar tags por empresa
DO $$
DECLARE
    company_record RECORD;
    has_company_col boolean := false;
    has_is_active boolean := false;
    total_tags integer;
    tags_activos integer;
    nombres_tags text;
BEGIN
    -- Detectar columnas en ticket_tags
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_tags' AND column_name = 'company_id'
    ) INTO has_company_col;

    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ticket_tags' AND column_name = 'is_active'
    ) INTO has_is_active;

    RAISE NOTICE 'MOSTRAR TAGS POR EMPRESA (has_company_col=%, has_is_active=%)', has_company_col, has_is_active;

    FOR company_record IN SELECT id, name FROM companies WHERE deleted_at IS NULL ORDER BY name LOOP
        IF has_company_col THEN
            EXECUTE format('SELECT COUNT(*) FROM ticket_tags WHERE company_id = %L', company_record.id)
            INTO total_tags;

            IF has_is_active THEN
                EXECUTE format('SELECT COUNT(*) FROM ticket_tags WHERE company_id = %L AND is_active = true', company_record.id)
                INTO tags_activos;
            ELSE
                tags_activos := total_tags;
            END IF;

            EXECUTE format('SELECT STRING_AGG(DISTINCT name, '','') FROM ticket_tags WHERE company_id = %L', company_record.id)
            INTO nombres_tags;
        ELSE
            -- ticket_tags is global (no company_id) — show global counts/names for each company row
            SELECT COUNT(*) INTO total_tags FROM ticket_tags;

            IF has_is_active THEN
                SELECT COUNT(*) INTO tags_activos FROM ticket_tags WHERE is_active = true;
            ELSE
                tags_activos := total_tags;
            END IF;

            SELECT STRING_AGG(DISTINCT name, ', ') INTO nombres_tags FROM ticket_tags;
        END IF;

        RAISE NOTICE 'TAGS POR EMPRESA: % | total_tags=% | tags_activos=% | nombres=%', company_record.name, COALESCE(total_tags,0), COALESCE(tags_activos,0), COALESCE(nombres_tags,'-');
    END LOOP;
END $$;

-- Verificar que no hay tickets sin servicios
SELECT 
    'VERIFICACIÓN SERVICIOS' as info,
    COUNT(*) as tickets_sin_servicios
FROM tickets t 
LEFT JOIN ticket_services ts ON t.id = ts.ticket_id 
WHERE ts.ticket_id IS NULL;

-- Verificar que no hay tickets con menos de 2 tags
SELECT 
    'VERIFICACIÓN TAGS' as info,
    COUNT(*) as tickets_con_menos_de_2_tags
FROM tickets t
WHERE (
    SELECT COUNT(*) FROM ticket_tag_relations ttr 
    WHERE ttr.ticket_id = t.id
) < 2;

-- Resumen de tickets por cantidad de tags
SELECT 
    'DISTRIBUCIÓN DE TAGS' as info,
    tag_count as cantidad_tags,
    COUNT(*) as tickets_con_esta_cantidad
FROM (
    SELECT 
        t.id,
        COUNT(ttr.tag_id) as tag_count
    FROM tickets t
    LEFT JOIN ticket_tag_relations ttr ON t.id = ttr.ticket_id
    GROUP BY t.id
) tag_summary
GROUP BY tag_count
ORDER BY cantidad_tags;

SELECT 'Script ejecutado exitosamente - Cada ticket ahora tiene al menos 1 servicio y 2 tags asociados' AS resultado;
