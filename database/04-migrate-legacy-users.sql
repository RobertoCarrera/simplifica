-- =============================================
-- MIGRACIÓN DE DATOS LEGACY A MULTI-TENANT
-- =============================================

-- 1. Actualizar tabla users para incluir permisos de módulos
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{
  "moduloFacturas": false,
  "moduloPresupuestos": false, 
  "moduloServicios": false,
  "moduloMaterial": false
}'::jsonb;

-- 2. Agregar información adicional a companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS legacy_negocio_id TEXT;

-- 3. Crear función simplificada para migrar datos legacy
CREATE OR REPLACE FUNCTION migrate_legacy_users()
RETURNS TEXT AS $$
DECLARE
    company_uuid UUID;
    result_text TEXT := '';
BEGIN
    -- Limpiar datos anteriores de migración si existen
    DELETE FROM users WHERE email LIKE '%@michinanny.es' OR email LIKE '%@anscarr.es' OR email LIKE '%@liberatuscreencias.com' OR email LIKE '%@satpcgo.es';
    DELETE FROM companies WHERE legacy_negocio_id IS NOT NULL;
    
    -- EMPRESA 1: michinanny.es
    INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        'Michinanny',
        'https://michinanny.es/',
        '671ec9f84ecc7019c9ea3bd2',
        '2024-10-27 19:19:00'::timestamp,
        NOW()
    ) RETURNING id INTO company_uuid;
    
    result_text := result_text || 'Empresa Michinanny creada: ' || company_uuid::text || E'\n';
    
    -- Usuarios de Michinanny
    INSERT INTO users (id, company_id, email, name, permissions, created_at, updated_at)
    VALUES 
    (gen_random_uuid(), company_uuid, 'marina@michinanny.es', 'Marina Casado García', 
     '{"moduloFacturas": false, "moduloPresupuestos": false, "moduloServicios": true, "moduloMaterial": false}'::jsonb,
     '2024-10-27 19:19:00'::timestamp, NOW()),
    (gen_random_uuid(), company_uuid, 'eva@michinanny.es', 'Eva Marín',
     '{"moduloFacturas": false, "moduloPresupuestos": false, "moduloServicios": true, "moduloMaterial": false}'::jsonb,
     '2024-10-27 19:20:00'::timestamp, NOW());
    
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
    
    INSERT INTO users (id, company_id, email, full_name, permissions, created_at, updated_at)
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
        '671eca034ecc7019c9ea3bd3',
        '2024-10-30 18:07:00'::timestamp,
        NOW()
    ) RETURNING id INTO company_uuid;
    
    INSERT INTO users (id, company_id, email, full_name, permissions, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        company_uuid,
        'alberto@satpcgo.es',
        'Alberto Dominguez',
        '{"moduloFacturas": true, "moduloPresupuestos": true, "moduloServicios": true, "moduloMaterial": true}'::jsonb,
        '2024-10-30 18:07:00'::timestamp,
        NOW()
    );
    
    result_text := result_text || 'Migración completada exitosamente. 4 empresas y 5 usuarios creados.';
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Crear función para obtener permisos de usuario
CREATE OR REPLACE FUNCTION get_user_permissions(user_email TEXT)
RETURNS JSONB AS $$
DECLARE
    user_perms JSONB;
BEGIN
    SELECT permissions INTO user_perms
    FROM users 
    WHERE email = user_email 
    AND deleted_at IS NULL;
    
    RETURN COALESCE(user_perms, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Crear vista para usuarios con información de empresa
CREATE OR REPLACE VIEW users_with_company AS
SELECT 
    u.id,
    u.email,
    u.full_name,
    u.permissions,
    u.created_at as user_created_at,
    c.id as company_id,
    c.name as company_name,
    c.website as company_website,
    c.legacy_negocio_id
FROM users u
JOIN companies c ON u.company_id = c.id
WHERE u.deleted_at IS NULL 
AND c.deleted_at IS NULL;

-- 6. Ejecutar la migración
SELECT migrate_legacy_users();

-- 7. Verificar la migración
SELECT 
    company_name,
    company_website,
    full_name,
    email,
    permissions
FROM users_with_company
ORDER BY company_name, full_name;
