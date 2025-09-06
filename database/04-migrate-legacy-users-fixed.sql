-- Script para migrar datos legacy de USUARIOS a la nueva estructura multi-tenant
-- Corrige nombres de columnas para que coincidan con el esquema actual

-- Agregar columna de permisos a usuarios si no existe
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- Agregar columnas para tracking de datos legacy a companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS legacy_negocio_id TEXT;

-- Función para migrar usuarios legacy
CREATE OR REPLACE FUNCTION migrate_legacy_users()
RETURNS VOID AS $$
DECLARE
    company_uuid UUID;
BEGIN
    RAISE NOTICE 'Iniciando migración de usuarios legacy...';
    
    -- EMPRESA 1: Michinanny
    INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        'Michinanny',
        'https://michinanny.es/',
        '671da7c0ecec11a7b9bbc029',
        '2024-10-27 19:19:00'::timestamp,
        NOW()
    ) RETURNING id INTO company_uuid;
    
    -- Usuarios de Michinanny
    INSERT INTO users (id, company_id, email, name, permissions, created_at, updated_at)
    VALUES 
    (gen_random_uuid(), company_uuid, 'marina@michinanny.es', 'Marina Casado García', 
     '{"moduloFacturas": false, "moduloPresupuestos": false, "moduloServicios": true, "moduloMaterial": false}'::jsonb,
     '2024-10-27 19:19:00'::timestamp, NOW()),
    (gen_random_uuid(), company_uuid, 'eva@michinanny.es', 'Eva Marín',
     '{"moduloFacturas": false, "moduloPresupuestos": false, "moduloServicios": true, "moduloMaterial": false}'::jsonb,
     '2024-10-27 19:20:00'::timestamp, NOW());
    
    -- EMPRESA 2: anscarr.es
    INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        'Anscarr',
        'https://anscarr.es/',
        '67f38eaeb414535e7d278c71',
        '2024-10-27 19:37:00'::timestamp,
        NOW()
    ) RETURNING id INTO company_uuid;
    
    INSERT INTO users (id, company_id, email, name, permissions, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        company_uuid,
        'roberto@anscarr.es',
        'Roberto Hugo Carrera',
        '{"moduloFacturas": true, "moduloPresupuestos": true, "moduloServicios": true, "moduloMaterial": true}'::jsonb,
        '2024-10-27 19:37:00'::timestamp,
        NOW()
    );
    
    INSERT INTO users (id, company_id, email, name, permissions, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        company_uuid,
        'carlosanscarr@gmail.com',
        'Carlos José Anaya Escalante',
        '{"moduloFacturas": true, "moduloPresupuestos": true, "moduloServicios": true, "moduloMaterial": true}'::jsonb,
        '2024-10-11 09:54:00'::timestamp,
        NOW()
    );
    
    -- EMPRESA 3: liberatuscreencias.com
    INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        'Libera Tus Creencias',
        'https://liberatuscreencias.com/',
        '67227971cb317c137fb1dd20',
        '2024-10-27 19:40:00'::timestamp,
        NOW()
    ) RETURNING id INTO company_uuid;
    
    INSERT INTO users (id, company_id, email, name, permissions, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        company_uuid,
        'vanesa@liberatuscreencias.com',
        'Vanesa Santa Maria Garibaldi',
        '{"moduloFacturas": false, "moduloPresupuestos": false, "moduloServicios": false, "moduloMaterial": false}'::jsonb,
        '2024-10-27 19:40:00'::timestamp,
        NOW()
    );
    
    -- EMPRESA 4: satpcgo.es
    INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        'SatPCGo',
        'https://satpcgo.es/',
        '6717b325cb317c137fb1dcd5',
        '2024-10-27 19:45:00'::timestamp,
        NOW()
    ) RETURNING id INTO company_uuid;
    
    INSERT INTO users (id, company_id, email, name, permissions, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        company_uuid,
        'jesus@satpcgo.es',
        'Jesus',
        '{"moduloFacturas": false, "moduloPresupuestos": false, "moduloServicios": false, "moduloMaterial": false}'::jsonb,
        '2024-10-27 19:45:00'::timestamp,
        NOW()
    );
    
    RAISE NOTICE 'Migración completada. Insertadas 4 empresas y 5 usuarios.';
    
END;
$$ LANGUAGE plpgsql;

-- Crear vista mejorada para ver usuarios con sus empresas (nombre corregido)
CREATE OR REPLACE VIEW users_with_company AS
SELECT 
    u.id as user_id,
    u.email,
    u.name,
    u.permissions,
    u.created_at as user_created_at,
    c.id as company_id,
    c.name as company_name,
    c.website,
    c.legacy_negocio_id
FROM users u
JOIN companies c ON u.company_id = c.id
WHERE u.deleted_at IS NULL 
AND c.deleted_at IS NULL;

-- Vista resumen de la migración
CREATE OR REPLACE VIEW migration_summary AS
SELECT 
    company_name,
    COUNT(*) as user_count,
    array_agg(name) as users,
    website
FROM users_with_company
GROUP BY company_name, website
ORDER BY company_name, name;

-- Ejecutar la migración
-- SELECT migrate_legacy_users();

-- Verificar resultados
-- SELECT * FROM migration_summary;
