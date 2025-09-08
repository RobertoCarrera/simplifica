-- ================================================
-- SETUP COMPLETO PARA EL SISTEMA DE TICKETS
-- ================================================
-- Este script configura todas las tablas y datos necesarios para el sistema de tickets
-- Ejecutar en el SQL Editor de Supabase

-- ================================================
-- 0. CREAR COMPAÑÍA DE PRUEBA SI NO EXISTE
-- ================================================
DO $$
DECLARE
    demo_company_id uuid;
    demo_user_id uuid;
    demo_client_id uuid;
BEGIN
    -- Verificar si ya existe una compañía
    SELECT id INTO demo_company_id FROM companies WHERE deleted_at IS NULL LIMIT 1;
    
    IF demo_company_id IS NULL THEN
        -- Crear compañía demo
        INSERT INTO companies (id, name, website, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Demo Taller SAT',
            'demo-taller.com',
            NOW(),
            NOW()
        )
        RETURNING id INTO demo_company_id;
        
        RAISE NOTICE 'Compañía demo creada: %', demo_company_id;
    ELSE
        RAISE NOTICE 'Usando compañía existente: %', demo_company_id;
    END IF;
    
    -- Crear usuario demo si no existe
    SELECT id INTO demo_user_id FROM users WHERE company_id = demo_company_id LIMIT 1;
    
    IF demo_user_id IS NULL THEN
        INSERT INTO users (id, company_id, email, name, role, active, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            demo_company_id,
            'admin@demo-taller.com',
            'Administrador Demo',
            'owner',
            true,
            NOW(),
            NOW()
        )
        RETURNING id INTO demo_user_id;
        
        RAISE NOTICE 'Usuario demo creado: %', demo_user_id;
    END IF;
    
    -- Crear algunos clientes demo si no existen
    SELECT id INTO demo_client_id FROM clients WHERE company_id = demo_company_id LIMIT 1;
    
    IF demo_client_id IS NULL THEN
        INSERT INTO clients (company_id, name, email, phone, address, created_at, updated_at)
        VALUES 
            (demo_company_id, 'Juan Pérez García', 'juan.perez@email.com', '+34 666 123 456', '{"direccion": "Calle Mayor 123", "ciudad": "Madrid", "cp": "28001"}', NOW(), NOW()),
            (demo_company_id, 'María González López', 'maria.gonzalez@email.com', '+34 677 234 567', '{"direccion": "Avenida de la Paz 45", "ciudad": "Barcelona", "cp": "08001"}', NOW(), NOW()),
            (demo_company_id, 'Carlos Rodríguez Martín', 'carlos.rodriguez@email.com', '+34 688 345 678', '{"direccion": "Plaza España 12", "ciudad": "Valencia", "cp": "46001"}', NOW(), NOW()),
            (demo_company_id, 'Ana Martínez Ruiz', 'ana.martinez@email.com', '+34 699 456 789', '{"direccion": "Calle del Sol 89", "ciudad": "Sevilla", "cp": "41001"}', NOW(), NOW());
        
        RAISE NOTICE 'Clientes demo creados';
    END IF;
    
END $$;

-- ================================================
-- SINCRONIZAR `stages` CON `ticket_stages` (si falta alguno)
-- ================================================
DO $$
DECLARE
    demo_company_id uuid;
    stage_name text;
    existing_id uuid;
BEGIN
    SELECT id INTO demo_company_id FROM companies WHERE deleted_at IS NULL LIMIT 1;

    FOR stage_name IN
        SELECT name FROM stages WHERE company_id = demo_company_id
    LOOP
        SELECT id INTO existing_id FROM ticket_stages WHERE name = stage_name LIMIT 1;
        IF existing_id IS NULL THEN
            INSERT INTO ticket_stages (id, name, position, color, created_at, updated_at)
            VALUES (gen_random_uuid(), stage_name, 0, '#6b7280', NOW(), NOW());
        END IF;
    END LOOP;
    RAISE NOTICE 'Sincronización stages -> ticket_stages completada.';
END $$;


-- ================================================
-- 1. VERIFICAR Y USAR TABLAS EXISTENTES
-- ================================================
-- La tabla services ya existe en el esquema
-- La tabla stages ya existe en el esquema  
-- La tabla tickets ya existe en el esquema
-- Solo necesitamos verificar que existan y añadir datos

-- ================================================
-- 2. INSERTAR SERVICIOS DE PRUEBA
-- ================================================
DO $$
DECLARE
    demo_company_id uuid;
BEGIN
    -- Obtener la primera compañía disponible
    SELECT id INTO demo_company_id FROM companies WHERE deleted_at IS NULL LIMIT 1;
    
    -- Verificar si ya existen servicios para esta compañía
    IF NOT EXISTS (SELECT 1 FROM services WHERE company_id = demo_company_id LIMIT 1) THEN
        INSERT INTO services (name, description, base_price, estimated_hours, category, company_id, is_active, created_at, updated_at)
        VALUES 
            ('Diagnóstico de Hardware', 'Análisis completo del estado del hardware del equipo', 25.00, 0.5, 'Diagnóstico', demo_company_id, true, NOW(), NOW()),
            ('Instalación de Sistema Operativo', 'Instalación limpia de Windows/Linux con drivers básicos', 45.00, 2.0, 'Software', demo_company_id, true, NOW(), NOW()),
            ('Limpieza Profunda', 'Limpieza física completa del equipo, cambio de pasta térmica', 30.00, 1.0, 'Mantenimiento', demo_company_id, true, NOW(), NOW()),
            ('Recuperación de Datos', 'Recuperación de archivos de discos dañados o formateados', 80.00, 3.0, 'Datos', demo_company_id, true, NOW(), NOW()),
            ('Eliminación de Virus', 'Análisis y eliminación completa de malware y virus', 35.00, 1.5, 'Seguridad', demo_company_id, true, NOW(), NOW()),
            ('Actualización de Hardware', 'Instalación y configuración de componentes nuevos', 40.00, 1.5, 'Hardware', demo_company_id, true, NOW(), NOW()),
            ('Configuración de Red', 'Configuración de conexiones de red y compartición', 30.00, 1.0, 'Redes', demo_company_id, true, NOW(), NOW()),
            ('Backup y Restauración', 'Copia de seguridad y restauración de datos', 50.00, 2.0, 'Datos', demo_company_id, true, NOW(), NOW()),
            ('Optimización del Sistema', 'Limpieza y optimización del rendimiento del sistema', 35.00, 1.5, 'Mantenimiento', demo_company_id, true, NOW(), NOW()),
            ('Reparación de Pantalla', 'Cambio de pantalla LCD/LED en portátiles', 60.00, 2.5, 'Hardware', demo_company_id, true, NOW(), NOW()),
            ('Configuración de Software', 'Instalación y configuración de aplicaciones', 25.00, 1.0, 'Software', demo_company_id, true, NOW(), NOW()),
            ('Mantenimiento Preventivo', 'Limpieza y optimización general del equipo', 40.00, 1.5, 'Mantenimiento', demo_company_id, true, NOW(), NOW()),
            ('Cambio de Batería', 'Sustitución de batería en portátiles y móviles', 35.00, 0.5, 'Hardware', demo_company_id, true, NOW(), NOW()),
            ('Formateo Completo', 'Formateo e instalación desde cero', 50.00, 2.5, 'Software', demo_company_id, true, NOW(), NOW()),
            ('Reparación de Teclado', 'Reparación o cambio de teclado', 30.00, 1.0, 'Hardware', demo_company_id, true, NOW(), NOW());
        
        RAISE NOTICE 'Servicios demo insertados para compañía: %', demo_company_id;
    ELSE
        RAISE NOTICE 'Los servicios ya existen para la compañía: %', demo_company_id;
    END IF;
END $$;

-- ================================================
-- 3. INSERTAR ETAPAS DE TICKETS
-- ================================================
DO $$
DECLARE
    demo_company_id uuid;
BEGIN
    -- Obtener la primera compañía disponible
    SELECT id INTO demo_company_id FROM companies WHERE deleted_at IS NULL LIMIT 1;
    
    -- Verificar si ya existen etapas para esta compañía
    IF NOT EXISTS (SELECT 1 FROM stages WHERE company_id = demo_company_id LIMIT 1) THEN
        INSERT INTO stages (name, description, color, order_position, is_initial, is_final, company_id, is_active, created_at, updated_at)
        VALUES 
            ('Recibido', 'Ticket recién creado, pendiente de revisión', '#3B82F6', 1, true, false, demo_company_id, true, NOW(), NOW()),
            ('En Análisis', 'Analizando el problema reportado', '#F59E0B', 2, false, false, demo_company_id, true, NOW(), NOW()),
            ('En Progreso', 'Trabajando en la solución del problema', '#10B981', 3, false, false, demo_company_id, true, NOW(), NOW()),
            ('En Espera', 'Esperando información del cliente o piezas', '#F97316', 4, false, false, demo_company_id, true, NOW(), NOW()),
            ('Listo para Entrega', 'Reparación completada, listo para recoger', '#8B5CF6', 5, false, false, demo_company_id, true, NOW(), NOW()),
            ('Entregado', 'Cliente ha recogido el dispositivo', '#059669', 6, false, true, demo_company_id, true, NOW(), NOW()),
            ('Cancelado', 'Ticket cancelado por el cliente o imposible reparar', '#EF4444', 7, false, true, demo_company_id, true, NOW(), NOW());
        
        RAISE NOTICE 'Etapas demo insertadas para compañía: %', demo_company_id;
    ELSE
        RAISE NOTICE 'Las etapas ya existen para la compañía: %', demo_company_id;
    END IF;
END $$;

-- ================================================
-- 4. CREAR ALGUNOS TICKETS DE PRUEBA
-- ================================================
DO $$
DECLARE
    demo_company_id uuid;
    demo_client_id uuid;
    demo_user_id uuid;
    recibido_stage_id uuid;
    en_progreso_stage_id uuid;
    listo_stage_id uuid;
    servicio_diagnostico_id uuid;
    servicio_limpieza_id uuid;
    servicio_pantalla_id uuid;
BEGIN
    -- Obtener IDs necesarios
    SELECT id INTO demo_company_id FROM companies WHERE deleted_at IS NULL LIMIT 1;
    SELECT id INTO demo_user_id FROM users WHERE company_id = demo_company_id LIMIT 1;
    SELECT id INTO demo_client_id FROM clients WHERE company_id = demo_company_id LIMIT 1;
    
    -- Obtener IDs de etapas
    -- Nota: la FK de tickets.stage_id referencia a la tabla `ticket_stages`.
    -- Asegurarse de que existan entradas en `ticket_stages` y usarlas aquí.
    SELECT id INTO recibido_stage_id FROM ticket_stages WHERE name = 'Recibido' LIMIT 1;
    IF recibido_stage_id IS NULL THEN
        INSERT INTO ticket_stages (id, name, position, color, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Recibido', 1, '#3B82F6', NOW(), NOW())
        RETURNING id INTO recibido_stage_id;
    END IF;

    SELECT id INTO en_progreso_stage_id FROM ticket_stages WHERE name = 'En Progreso' LIMIT 1;
    IF en_progreso_stage_id IS NULL THEN
        INSERT INTO ticket_stages (id, name, position, color, created_at, updated_at)
        VALUES (gen_random_uuid(), 'En Progreso', 3, '#10B981', NOW(), NOW())
        RETURNING id INTO en_progreso_stage_id;
    END IF;

    SELECT id INTO listo_stage_id FROM ticket_stages WHERE name = 'Listo para Entrega' LIMIT 1;
    IF listo_stage_id IS NULL THEN
        INSERT INTO ticket_stages (id, name, position, color, created_at, updated_at)
        VALUES (gen_random_uuid(), 'Listo para Entrega', 5, '#8B5CF6', NOW(), NOW())
        RETURNING id INTO listo_stage_id;
    END IF;
    
    -- Obtener IDs de servicios
    SELECT id INTO servicio_diagnostico_id FROM services WHERE company_id = demo_company_id AND name = 'Diagnóstico de Hardware';
    SELECT id INTO servicio_limpieza_id FROM services WHERE company_id = demo_company_id AND name = 'Limpieza Profunda';
    SELECT id INTO servicio_pantalla_id FROM services WHERE company_id = demo_company_id AND name = 'Reparación de Pantalla';
    
    -- Verificar si ya existen tickets
    IF NOT EXISTS (SELECT 1 FROM tickets WHERE company_id = demo_company_id LIMIT 1) THEN
        -- Insertar tickets demo usando el esquema existente
        INSERT INTO tickets (title, description, client_id, company_id, stage_id, priority, due_date, total_amount, created_at, updated_at)
        VALUES 
            (
                'Portátil no enciende - Diagnóstico urgente',
                'El cliente reporta que su portátil HP Pavilion no enciende. Se escucha un pitido al conectar el cargador pero la pantalla permanece negra.',
                demo_client_id,
                demo_company_id,
                recibido_stage_id,
                'high',
                CURRENT_DATE + INTERVAL '3 days',
                25.00,
                NOW() - INTERVAL '2 hours',
                NOW()
            ),
            (
                'Limpieza y mantenimiento preventivo',
                'Mantenimiento programado para equipo de gaming. Incluye limpieza de ventiladores, cambio de pasta térmica y optimización del sistema.',
                (SELECT id FROM clients WHERE company_id = demo_company_id ORDER BY created_at LIMIT 1 OFFSET 1),
                demo_company_id,
                en_progreso_stage_id,
                'normal',
                CURRENT_DATE + INTERVAL '5 days',
                70.00,
                NOW() - INTERVAL '1 day',
                NOW()
            ),
            (
                'Cambio de pantalla MacBook Pro',
                'Pantalla agrietada en MacBook Pro 13". Cliente necesita reparación urgente para trabajo.',
                (SELECT id FROM clients WHERE company_id = demo_company_id ORDER BY created_at LIMIT 1 OFFSET 2),
                demo_company_id,
                listo_stage_id,
                'urgent',
                CURRENT_DATE + INTERVAL '1 day',
                180.00,
                NOW() - INTERVAL '3 days',
                NOW()
            ),
            (
                'Instalación Windows 11 y migración de datos',
                'Actualización de Windows 10 a Windows 11 con migración completa de datos y configuración de aplicaciones empresariales.',
                (SELECT id FROM clients WHERE company_id = demo_company_id ORDER BY created_at LIMIT 1 OFFSET 3),
                demo_company_id,
                recibido_stage_id,
                'normal',
                CURRENT_DATE + INTERVAL '7 days',
                95.00,
                NOW() - INTERVAL '30 minutes',
                NOW()
            );
        
        RAISE NOTICE 'Tickets demo insertados para compañía: %', demo_company_id;
    ELSE
        RAISE NOTICE 'Los tickets ya existen para la compañía: %', demo_company_id;
    END IF;
END $$;

-- ================================================
-- 5. VERIFICACIÓN FINAL Y ESTADÍSTICAS
-- ================================================
DO $$
DECLARE
    demo_company_id uuid;
    services_count integer;
    stages_count integer;
    clients_count integer;
    tickets_count integer;
    users_count integer;
BEGIN
    -- Obtener la primera compañía
    SELECT id INTO demo_company_id FROM companies WHERE deleted_at IS NULL LIMIT 1;
    
    -- Contar registros
    SELECT COUNT(*) INTO services_count FROM services WHERE company_id = demo_company_id;
    SELECT COUNT(*) INTO stages_count FROM stages WHERE company_id = demo_company_id;
    SELECT COUNT(*) INTO clients_count FROM clients WHERE company_id = demo_company_id;
    SELECT COUNT(*) INTO tickets_count FROM tickets WHERE company_id = demo_company_id;
    SELECT COUNT(*) INTO users_count FROM users WHERE company_id = demo_company_id;
    
    RAISE NOTICE '=== SETUP COMPLETADO ===';
    RAISE NOTICE 'Compañía ID: %', demo_company_id;
    RAISE NOTICE 'Servicios creados: %', services_count;
    RAISE NOTICE 'Etapas creadas: %', stages_count;
    RAISE NOTICE 'Clientes creados: %', clients_count;
    RAISE NOTICE 'Tickets creados: %', tickets_count;
    RAISE NOTICE 'Usuarios creados: %', users_count;
    RAISE NOTICE '========================';
END $$;

-- Mostrar resumen de datos creados
SELECT 
    'companies' as tabla,
    COUNT(*) as registros
FROM companies 
WHERE deleted_at IS NULL

UNION ALL

SELECT 
    'services' as tabla,
    COUNT(*) as registros
FROM services 
WHERE company_id = (SELECT id FROM companies WHERE deleted_at IS NULL LIMIT 1)

UNION ALL

SELECT 
    'stages' as tabla,
    COUNT(*) as registros
FROM stages 
WHERE company_id = (SELECT id FROM companies WHERE deleted_at IS NULL LIMIT 1)

UNION ALL

SELECT 
    'clients' as tabla,
    COUNT(*) as registros
FROM clients 
WHERE company_id = (SELECT id FROM companies WHERE deleted_at IS NULL LIMIT 1)

UNION ALL

SELECT 
    'tickets' as tabla,
    COUNT(*) as registros
FROM tickets 
WHERE company_id = (SELECT id FROM companies WHERE deleted_at IS NULL LIMIT 1)

UNION ALL

SELECT 
    'users' as tabla,
    COUNT(*) as registros
FROM users 
WHERE company_id = (SELECT id FROM companies WHERE deleted_at IS NULL LIMIT 1);

-- Mostrar los servicios disponibles
SELECT 
    'SERVICIOS DISPONIBLES' as info,
    name as nombre,
    category as categoria,
    base_price as precio,
    estimated_hours as horas_estimadas
FROM services 
WHERE company_id = (SELECT id FROM companies WHERE deleted_at IS NULL LIMIT 1)
AND deleted_at IS NULL
ORDER BY category, name;

-- Mostrar las etapas del workflow
SELECT 
    'ETAPAS DEL WORKFLOW' as info,
    name as nombre,
    description as descripcion,
    color,
    order_position as orden
FROM stages 
WHERE company_id = (SELECT id FROM companies WHERE deleted_at IS NULL LIMIT 1)
ORDER BY order_position;

-- Mostrar tickets demo creados
SELECT 
    'TICKETS DEMO' as info,
    t.title as titulo,
    c.name as cliente,
    s.name as etapa,
    t.priority as prioridad,
    t.total_amount as importe
FROM tickets t
JOIN clients c ON t.client_id = c.id
JOIN stages s ON t.stage_id = s.id
WHERE t.company_id = (SELECT id FROM companies WHERE deleted_at IS NULL LIMIT 1)
ORDER BY t.created_at DESC;
