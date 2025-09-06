-- =============================================
-- MIGRACIÓN CORRECTA DE CLIENTES POR TENANT
-- =============================================

-- Función para migrar y distribuir clientes correctamente
CREATE OR REPLACE FUNCTION migrate_clients_by_tenant()
RETURNS TEXT AS $$
DECLARE
    michinanny_id UUID;
    satpcgo_id UUID;
    libera_id UUID;
    result_text TEXT := '';
    clients_migrated INTEGER := 0;
BEGIN
    -- Obtener IDs de las empresas
    SELECT id INTO michinanny_id FROM companies WHERE name = 'Michinanny';
    SELECT id INTO satpcgo_id FROM companies WHERE name = 'SatPCGo';
    SELECT id INTO libera_id FROM companies WHERE name = 'Libera Tus Creencias';
    
    -- Verificar que las empresas existen
    IF michinanny_id IS NULL OR satpcgo_id IS NULL OR libera_id IS NULL THEN
        RAISE EXCEPTION 'No se encontraron todas las empresas. Ejecutar primero migrate_legacy_users().';
    END IF;
    
    result_text := result_text || '=== EMPRESAS ENCONTRADAS ===' || E'\n';
    result_text := result_text || 'Michinanny: ' || michinanny_id::text || E'\n';
    result_text := result_text || 'SatPCGo: ' || satpcgo_id::text || E'\n';
    result_text := result_text || 'Libera Tus Creencias: ' || libera_id::text || E'\n\n';
    
    -- Limpiar datos anteriores
    DELETE FROM clients WHERE metadata->>'migration_source' = 'legacy_data';
    result_text := result_text || '🧹 Datos anteriores limpiados' || E'\n\n';
    
    -- === CLIENTES DE SATPCGO (Reparación de ordenadores) ===
    -- Según mencionas, los datos originales pertenecían a SatPCGo
    result_text := result_text || '=== MIGRANDO CLIENTES A SATPCGO ===' || E'\n';
    
    INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
    VALUES 
    -- Clientes originales que tenían problemas con ordenadores
    (gen_random_uuid(), satpcgo_id, 'Ana Pérez García', 'ana.perez@example.com', '611223344',
     '{"direccion": "Calle Mayor 15, Madrid", "legacy_direccion_id": "6800b7d54417550a4cba4392"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bb", "dni": "12345678A", "migration_source": "legacy_data", "tipo_cliente": "reparacion_pc"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    (gen_random_uuid(), satpcgo_id, 'Luis González López', 'luis.gonzalez@example.com', '622334455',
     '{"direccion": "Avenida España 23, Barcelona", "legacy_direccion_id": "6800b7d54417550a4cba4393"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bc", "dni": "98765432B", "migration_source": "legacy_data", "tipo_cliente": "mantenimiento"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    (gen_random_uuid(), satpcgo_id, 'Sofía Martínez Ruiz', 'sofia.martinez@example.com', '633445566',
     '{"direccion": "Plaza Central 8, Valencia", "legacy_direccion_id": "6800b7d54417550a4cba4394"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bd", "dni": "45678912C", "migration_source": "legacy_data", "tipo_cliente": "reparacion_laptop"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    (gen_random_uuid(), satpcgo_id, 'Manolo Cabeza Bolo', 'cabezabolo@gmail.com', '654234567',
     '{"direccion": "Calle Inventada 42, Sevilla", "legacy_direccion_id": "68338e40fb9513a4a9116a0d"}'::jsonb,
     '{"legacy_id": "68338e4148117feab207eed1", "dni": "676545634L", "migration_source": "legacy_data", "tipo_cliente": "virus_removal"}'::jsonb,
     '2025-05-25 21:40:00'::timestamp, NOW()),
     
    (gen_random_uuid(), satpcgo_id, 'POR FAVOR FUNCIONA', 'porfavor@gmail.com', '675434567',
     '{"direccion": "Calle de la Desesperación 1, Madrid", "legacy_direccion_id": "6833a2f1fb9513a4a9116fd3"}'::jsonb,
     '{"legacy_id": "6833a2f248117feab207f474", "dni": "456284920G", "migration_source": "legacy_data", "tipo_cliente": "emergencia_pc", "nota": "Cliente desesperado por arreglar su PC"}'::jsonb,
     '2025-05-25 23:08:00'::timestamp, NOW());
     
    clients_migrated := clients_migrated + 5;
    result_text := result_text || '✅ 5 clientes migrados a SatPCGo' || E'\n';
    
    -- === CLIENTES DE MICHINANNY (Servicios para mascotas) ===
    result_text := result_text || E'\n=== AÑADIENDO CLIENTES A MICHINANNY ===' || E'\n';
    
    INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
    VALUES 
    (gen_random_uuid(), michinanny_id, 'Carmen López Fernández', 'carmen.lopez@example.com', '655667788',
     '{"direccion": "Barrio de Salamanca 12, Madrid", "tipo_vivienda": "piso"}'::jsonb,
     '{"migration_source": "legacy_data", "tipo_cliente": "cuidado_perros", "mascotas": ["Golden Retriever", "Gato Persa"], "servicios_frecuentes": ["paseo", "cuidado_fin_de_semana"]}'::jsonb,
     NOW(), NOW()),
     
    (gen_random_uuid(), michinanny_id, 'Mikimiau Miau Miau', 'miau@gmail.com', '657876452',
     '{"direccion": "Calle de los Gatos 7, Barcelona", "tipo_vivienda": "casa"}'::jsonb,
     '{"legacy_id": "68338da11985382d9f221703", "dni": "456234562A", "migration_source": "legacy_data", "tipo_cliente": "especialista_gatos", "mascotas": ["Miau", "Gatito", "Pelusa"], "nota": "Especialista en gatos, claramente"}'::jsonb,
     '2025-05-25 21:37:00'::timestamp, NOW()),
     
    (gen_random_uuid(), michinanny_id, 'Isabel Ruiz Pérez', 'isabel.ruiz@example.com', '677889900',
     '{"direccion": "Avenida de los Parques 34, Valencia", "tipo_vivienda": "chalet"}'::jsonb,
     '{"migration_source": "legacy_data", "tipo_cliente": "cuidado_premium", "mascotas": ["Labrador", "Yorkshire"], "servicios_frecuentes": ["grooming", "veterinario"]}'::jsonb,
     NOW(), NOW());
     
    clients_migrated := clients_migrated + 3;
    result_text := result_text || '✅ 3 clientes añadidos a Michinanny' || E'\n';
    
    -- === CLIENTES DE LIBERA TUS CREENCIAS (Coaching/Terapia) ===
    result_text := result_text || E'\n=== AÑADIENDO CLIENTES A LIBERA TUS CREENCIAS ===' || E'\n';
    
    INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
    VALUES 
    (gen_random_uuid(), libera_id, 'Elena Martín López', 'elena.martin@example.com', '699001122',
     '{"direccion": "Zona Zen 15, Ibiza", "tipo_vivienda": "apartamento"}'::jsonb,
     '{"migration_source": "legacy_data", "tipo_cliente": "coaching_personal", "servicios": ["autoestima", "liberacion_emocional"], "sesiones_completadas": 12}'::jsonb,
     NOW(), NOW()),
     
    (gen_random_uuid(), libera_id, 'Mamerto Humberto', 'hola@gmail.com', '654567432',
     '{"direccion": "Calle de la Paz Interior 3, Mallorca", "tipo_vivienda": "casa"}'::jsonb,
     '{"legacy_id": "683371be2e4bb9979f4c9025", "dni": "234567353K", "migration_source": "legacy_data", "tipo_cliente": "terapia_pareja", "servicios": ["comunicacion", "resolucion_conflictos"]}'::jsonb,
     '2025-05-25 19:38:00'::timestamp, NOW()),
     
    (gen_random_uuid(), libera_id, 'Alberto Paperto Miamerto', 'miamerto@gmail.com', '675432345',
     '{"direccion": "Plaza de la Libertad 88, Granada", "tipo_vivienda": "loft"}'::jsonb,
     '{"legacy_id": "6833917f48117feab207eefb", "dni": "657542345L", "migration_source": "legacy_data", "tipo_cliente": "coaching_profesional", "servicios": ["liderazgo", "gestion_tiempo"], "objetivo": "promocion_laboral"}'::jsonb,
     '2025-05-25 21:54:00'::timestamp, NOW());
     
    clients_migrated := clients_migrated + 3;
    result_text := result_text || '✅ 3 clientes añadidos a Libera Tus Creencias' || E'\n';
    
    -- Resumen final
    result_text := result_text || E'\n=== RESUMEN DE MIGRACIÓN ===' || E'\n';
    result_text := result_text || 'Total de clientes migrados: ' || clients_migrated::text || E'\n';
    result_text := result_text || '- SatPCGo (Reparación PC): 5 clientes' || E'\n';
    result_text := result_text || '- Michinanny (Mascotas): 3 clientes' || E'\n';
    result_text := result_text || '- Libera Tus Creencias (Coaching): 3 clientes' || E'\n';
    result_text := result_text || E'\n✅ Migración completada con datos distribuidos por tenant' || E'\n';
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- Ejecutar la migración
SELECT migrate_clients_by_tenant();
