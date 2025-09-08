-- ================================================================
-- SCRIPT DE LIMPIEZA COMPLETA Y CONFIGURACIÓN FINAL
-- ================================================================
-- Este script elimina todos los datos hardcodeados, unifica tablas duplicadas
-- y crea un sistema completo con datos de prueba dinámicos

-- ================================================================
-- PARTE 1: LIMPIEZA COMPLETA DE DATOS HARDCODEADOS
-- ================================================================

-- Eliminar tickets hardcodeados existentes
DELETE FROM tickets WHERE title IN (
    'Reparación de iPhone 12',
    'Mantenimiento PC Gaming',
    'Recuperación de datos'
);

-- Eliminar cualquier ticket demo anterior
DELETE FROM tickets WHERE description LIKE '%demo%' OR description LIKE '%prueba%';

-- Mensaje: tickets hardcodeados eliminados
SELECT 'Tickets hardcodeados eliminados' AS notice;

-- ================================================================
-- PARTE 2: UNIFICACIÓN DE TABLAS stages Y ticket_stages
-- ================================================================

-- Verificar qué tabla tiene más datos
DO $$
DECLARE
    stages_count integer;
    ticket_stages_count integer;
BEGIN
    SELECT COUNT(*) INTO stages_count FROM stages;
    SELECT COUNT(*) INTO ticket_stages_count FROM ticket_stages;
    
    RAISE NOTICE 'Registros en stages: %', stages_count;
    RAISE NOTICE 'Registros en ticket_stages: %', ticket_stages_count;
    
    -- ticket_stages tiene más datos según el usuario, así que mantenemos esa
    -- y eliminamos stages (pero primero actualizamos referencias si las hay)
    
    -- Verificar si hay tickets que usan stages en lugar de ticket_stages
    IF EXISTS (SELECT 1 FROM tickets t JOIN stages s ON t.stage_id = s.id) THEN
        RAISE NOTICE 'Encontradas referencias a stages en tickets, migrando...';
        
        -- Migrar referencias de stages a ticket_stages
        UPDATE tickets 
        SET stage_id = (
            SELECT ts.id 
            FROM ticket_stages ts 
            WHERE ts.name = (
                SELECT s.name 
                FROM stages s 
                WHERE s.id = tickets.stage_id
            )
            LIMIT 1
        )
        WHERE stage_id IN (SELECT id FROM stages);
    END IF;
    
    -- Ahora podemos eliminar la tabla stages duplicada
    -- Nota: No podemos hacer DROP TABLE desde un bloque DO, 
    -- así que marcaremos para eliminación manual
    RAISE NOTICE 'ACCIÓN MANUAL REQUERIDA: Eliminar tabla stages después de este script';
    RAISE NOTICE 'Comando: DROP TABLE IF EXISTS stages CASCADE;';
END $$;

-- ================================================================
-- PARTE 3: CREAR SISTEMA DE TAGS
-- ================================================================

-- Crear tabla de tags si no existe
CREATE TABLE IF NOT EXISTS ticket_tags (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name varchar(50) NOT NULL UNIQUE,
    color varchar(7) DEFAULT '#6b7280',
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Crear tabla de relación tickets-tags si no existe
CREATE TABLE IF NOT EXISTS ticket_tag_relations (
    ticket_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (ticket_id, tag_id),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES ticket_tags(id) ON DELETE CASCADE
);

-- Insertar tags predefinidos
INSERT INTO ticket_tags (name, color, description) VALUES
    ('Urgente', '#ef4444', 'Tickets que requieren atención inmediata'),
    ('Hardware', '#3b82f6', 'Problemas relacionados con componentes físicos'),
    ('Software', '#10b981', 'Problemas de sistema operativo o aplicaciones'),
    ('Garantía', '#8b5cf6', 'Reparaciones cubiertas por garantía'),
    ('Fuera de Garantía', '#f59e0b', 'Reparaciones no cubiertas por garantía'),
    ('Datos', '#06b6d4', 'Recuperación o migración de datos'),
    ('Limpieza', '#84cc16', 'Mantenimiento preventivo'),
    ('Diagnóstico', '#f97316', 'Análisis del problema'),
    ('Pantalla', '#ec4899', 'Problemas con displays'),
    ('Batería', '#eab308', 'Problemas de alimentación'),
    ('Teclado', '#6366f1', 'Problemas de entrada'),
    ('Red', '#14b8a6', 'Conectividad y redes'),
    ('Virus', '#dc2626', 'Seguridad y malware'),
    ('Gaming', '#7c3aed', 'Equipos especializados en gaming'),
    ('Empresarial', '#059669', 'Equipos de empresa')
ON CONFLICT (name) DO NOTHING;

-- Mensaje: sistema de tags creado
SELECT 'Sistema de tags creado' AS notice;

-- ================================================================
-- PARTE 4: CONFIGURACIÓN DINÁMICA DE DATOS DE PRUEBA
-- ================================================================

DO $$
DECLARE
    demo_company_id uuid;
    demo_user_id uuid;
    client_ids uuid[];
    service_ids uuid[];
    stage_ids uuid[];
    tag_ids uuid[];
    new_ticket_id uuid;
    random_client_id uuid;
    random_service_id uuid;
    random_stage_id uuid;
    random_tag_id uuid;
    i integer;
BEGIN
    -- Obtener la compañía existente
    SELECT id INTO demo_company_id FROM companies WHERE deleted_at IS NULL LIMIT 1;
    
    IF demo_company_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró ninguna compañía. Ejecuta primero el script de setup básico.';
    END IF;
    
    -- Obtener arrays de IDs existentes
    SELECT ARRAY(SELECT id FROM clients WHERE company_id = demo_company_id LIMIT 4) INTO client_ids;
    SELECT ARRAY(SELECT id FROM services WHERE company_id = demo_company_id LIMIT 10) INTO service_ids;
    SELECT ARRAY(SELECT id FROM ticket_stages LIMIT 8) INTO stage_ids;
    SELECT ARRAY(SELECT id FROM ticket_tags LIMIT 15) INTO tag_ids;
    
    -- Verificar que tenemos datos suficientes
    IF array_length(client_ids, 1) < 2 THEN
        RAISE EXCEPTION 'Se necesitan al menos 2 clientes. Ejecuta el script de setup básico primero.';
    END IF;
    
    IF array_length(service_ids, 1) < 5 THEN
        RAISE EXCEPTION 'Se necesitan al menos 5 servicios. Ejecuta el script de setup básico primero.';
    END IF;
    
    IF array_length(stage_ids, 1) < 3 THEN
        RAISE EXCEPTION 'Se necesitan al menos 3 etapas. Revisa la configuración de ticket_stages.';
    END IF;
    
    RAISE NOTICE 'Generando tickets dinámicos...';
    RAISE NOTICE 'Clientes disponibles: %', array_length(client_ids, 1);
    RAISE NOTICE 'Servicios disponibles: %', array_length(service_ids, 1);
    RAISE NOTICE 'Etapas disponibles: %', array_length(stage_ids, 1);
    RAISE NOTICE 'Tags disponibles: %', array_length(tag_ids, 1);
    
    -- Generar 8 tickets dinámicos con datos realistas
    FOR i IN 1..8 LOOP
        -- Seleccionar IDs aleatorios
        random_client_id := client_ids[1 + (random() * (array_length(client_ids, 1) - 1))::integer];
        random_stage_id := stage_ids[1 + (random() * (array_length(stage_ids, 1) - 1))::integer];
        
        -- Crear ticket con datos variables
        INSERT INTO tickets (
            title, 
            description, 
            client_id, 
            company_id, 
            stage_id, 
            priority, 
            due_date, 
            total_amount, 
            created_at, 
            updated_at
        ) VALUES (
            CASE i
                WHEN 1 THEN 'MacBook Pro no arranca - Diagnóstico completo'
                WHEN 2 THEN 'PC Gaming con sobrecalentamiento'
                WHEN 3 THEN 'Recuperación de datos de disco dañado'
                WHEN 4 THEN 'Tablet Android con pantalla rota'
                WHEN 5 THEN 'Limpieza profunda y optimización'
                WHEN 6 THEN 'Instalación Windows 11 Enterprise'
                WHEN 7 THEN 'Portátil con virus y malware'
                WHEN 8 THEN 'Configuración red empresarial'
            END,
            CASE i
                WHEN 1 THEN 'Cliente reporta que MacBook Pro 2019 no inicia. LED de carga parpadea pero no hay imagen. Posible problema de placa base.'
                WHEN 2 THEN 'Equipo gaming RTX 4080 presenta temperaturas altas. Ventiladores funcionando al máximo. Necesita limpieza y repaste térmico.'
                WHEN 3 THEN 'Disco SSD de 1TB no detectado. Cliente necesita recuperar documentos de trabajo urgentemente.'
                WHEN 4 THEN 'Samsung Galaxy Tab S8 con pantalla agrietada. Táctil funciona parcialmente. Cliente quiere presupuesto.'
                WHEN 5 THEN 'Portátil HP empresarial muy lento. Mantenimiento preventivo solicitado por departamento IT.'
                WHEN 6 THEN 'Migración de Windows 10 Pro a Windows 11 Enterprise. Incluye transferencia de aplicaciones corporativas.'
                WHEN 7 THEN 'Portátil infectado con múltiples malware. Navegador comprometido. Limpieza completa necesaria.'
                WHEN 8 THEN 'Configuración de red Wi-Fi empresarial en oficina nueva. 15 equipos a conectar.'
            END,
            random_client_id,
            demo_company_id,
            random_stage_id,
            CASE (random() * 3)::integer
                WHEN 0 THEN 'low'
                WHEN 1 THEN 'normal'
                WHEN 2 THEN 'high'
                ELSE 'urgent'
            END,
            CURRENT_DATE + INTERVAL '1 day' * (1 + (random() * 14)::integer),
            25.00 + (random() * 300)::numeric(10,2),
            NOW() - INTERVAL '1 hour' * (random() * 72)::integer,
            NOW()
        ) RETURNING id INTO new_ticket_id;
        
        -- Asignar 1-3 tags aleatorios a cada ticket
        FOR j IN 1..(1 + (random() * 2)::integer) LOOP
            random_tag_id := tag_ids[1 + (random() * (array_length(tag_ids, 1) - 1))::integer];
            
            INSERT INTO ticket_tag_relations (ticket_id, tag_id)
            VALUES (new_ticket_id, random_tag_id)
            ON CONFLICT DO NOTHING; -- Evitar duplicados
        END LOOP;
        
    END LOOP;
    
    RAISE NOTICE 'Generados 8 tickets dinámicos con tags asignados';
END $$;

-- ================================================================
-- PARTE 5: ACTUALIZAR ESTRUCTURA DE TICKETS PARA TAGS
-- ================================================================

-- Añadir columna tags a tickets si no existe (como array para compatibilidad)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tickets' AND column_name = 'tags'
    ) THEN
        ALTER TABLE tickets ADD COLUMN tags text[] DEFAULT '{}';
        RAISE NOTICE 'Columna tags añadida a tabla tickets';
    END IF;
END $$;

-- Actualizar la columna tags con los nombres de tags de la relación
UPDATE tickets SET tags = (
    SELECT ARRAY(
        SELECT tt.name 
        FROM ticket_tag_relations ttr 
        JOIN ticket_tags tt ON ttr.tag_id = tt.id 
        WHERE ttr.ticket_id = tickets.id
    )
) WHERE id IN (
    SELECT DISTINCT ticket_id FROM ticket_tag_relations
);

-- ================================================================
-- PARTE 6: ESTADÍSTICAS Y VERIFICACIÓN FINAL
-- ================================================================

DO $$
DECLARE
    companies_count integer;
    clients_count integer;
    services_count integer;
    stages_count integer;
    ticket_stages_count integer;
    tickets_count integer;
    tags_count integer;
    tag_relations_count integer;
BEGIN
    SELECT COUNT(*) INTO companies_count FROM companies WHERE deleted_at IS NULL;
    SELECT COUNT(*) INTO clients_count FROM clients;
    SELECT COUNT(*) INTO services_count FROM services;
    SELECT COUNT(*) INTO stages_count FROM stages;
    SELECT COUNT(*) INTO ticket_stages_count FROM ticket_stages;
    SELECT COUNT(*) INTO tickets_count FROM tickets;
    SELECT COUNT(*) INTO tags_count FROM ticket_tags;
    SELECT COUNT(*) INTO tag_relations_count FROM ticket_tag_relations;
    
    RAISE NOTICE '';
    RAISE NOTICE '===============================================';
    RAISE NOTICE '           CONFIGURACIÓN COMPLETADA          ';
    RAISE NOTICE '===============================================';
    RAISE NOTICE 'Empresas: %', companies_count;
    RAISE NOTICE 'Clientes: %', clients_count;
    RAISE NOTICE 'Servicios: %', services_count;
    RAISE NOTICE 'Stages (legacy): %', stages_count;
    RAISE NOTICE 'Ticket Stages: %', ticket_stages_count;
    RAISE NOTICE 'Tickets: %', tickets_count;
    RAISE NOTICE 'Tags disponibles: %', tags_count;
    RAISE NOTICE 'Relaciones ticket-tag: %', tag_relations_count;
    RAISE NOTICE '===============================================';
    RAISE NOTICE '';
    
    IF stages_count > 0 THEN
        RAISE NOTICE 'PENDIENTE: Ejecutar DROP TABLE stages CASCADE; para eliminar tabla duplicada';
    END IF;
END $$;

-- ================================================================
-- CONSULTAS DE VERIFICACIÓN
-- ================================================================

-- Mostrar tickets con sus tags
SELECT 
    'TICKETS CON TAGS' as info,
    t.id,
    t.title,
    c.name as cliente,
    ts.name as etapa,
    t.priority,
    t.tags,
    array_length(t.tags, 1) as num_tags
FROM tickets t
LEFT JOIN clients c ON t.client_id = c.id
LEFT JOIN ticket_stages ts ON t.stage_id = ts.id
ORDER BY t.created_at DESC;

-- Mostrar tags más usados
SELECT 
    'TAGS MÁS USADOS' as info,
    tt.name,
    tt.color,
    COUNT(ttr.ticket_id) as tickets_count
FROM ticket_tags tt
LEFT JOIN ticket_tag_relations ttr ON tt.id = ttr.tag_id
GROUP BY tt.id, tt.name, tt.color
ORDER BY tickets_count DESC, tt.name;

-- Mostrar distribución por etapas
SELECT 
    'DISTRIBUCIÓN POR ETAPAS' as info,
    ts.name,
    ts.color,
    COUNT(t.id) as tickets_count
FROM ticket_stages ts
LEFT JOIN tickets t ON ts.id = t.stage_id
GROUP BY ts.id, ts.name, ts.color
ORDER BY ts.position, tickets_count DESC;

-- Mensaje: script completado
SELECT 'Script de limpieza y configuración completado exitosamente' AS notice;
SELECT 'Revisar las consultas de verificación para confirmar los datos' AS notice;
