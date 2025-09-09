-- =============================================
-- MIGRACIÓN DE DATOS EXISTENTES A MULTI-TENANT
-- =============================================

-- Paso 1: Ejecutar primero el archivo update-existing-companies.sql

-- Paso 2: Verificar que las tablas tengan company_id
-- Nota: Según el schema, clients, tickets, services ya tienen company_id

-- Verificar estructura actual
DO $$ 
BEGIN
    -- Verificar que clients tiene company_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'company_id'
    ) THEN
        RAISE EXCEPTION 'La tabla clients no tiene company_id. Verificar schema.';
    END IF;
    
    -- Verificar que tickets tiene company_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tickets' AND column_name = 'company_id'
    ) THEN
        RAISE EXCEPTION 'La tabla tickets no tiene company_id. Verificar schema.';
    END IF;
    
    -- Verificar que services tiene company_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'services' AND column_name = 'company_id'
    ) THEN
        RAISE EXCEPTION 'La tabla services no tiene company_id. Verificar schema.';
    END IF;
    
    RAISE NOTICE 'Todas las tablas tienen company_id correctamente.';
END $$;

-- Paso 3: Asignar company_id a datos existentes que tengan NULL
-- Asignar clients existentes a la primera empresa disponible
UPDATE clients 
SET company_id = (SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1)
WHERE company_id IS NULL;

-- Asignar tickets existentes a la primera empresa disponible  
UPDATE tickets 
SET company_id = (SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1)
WHERE company_id IS NULL;

-- Asignar services existentes a la primera empresa disponible
UPDATE services 
SET company_id = (SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1)
WHERE company_id IS NULL;

-- Paso 4: Habilitar RLS en tablas principales (si no está ya habilitado)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Paso 5: Crear función helper para obtener company_id del usuario actual
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT company_id 
        FROM user_profiles 
        WHERE id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Paso 6: Crear políticas RLS actualizadas

-- Políticas para clients
DROP POLICY IF EXISTS "Users can only see clients from their company" ON clients;
CREATE POLICY "Users can only see clients from their company" ON clients
    FOR ALL USING (
        company_id = get_user_company_id() AND deleted_at IS NULL
    );

-- Políticas para tickets  
DROP POLICY IF EXISTS "Users can only see tickets from their company" ON tickets;
CREATE POLICY "Users can only see tickets from their company" ON tickets
    FOR ALL USING (
        company_id = get_user_company_id() AND deleted_at IS NULL
    );

-- Políticas para services
DROP POLICY IF EXISTS "Users can only see services from their company" ON services;
CREATE POLICY "Users can only see services from their company" ON services
    FOR ALL USING (
        company_id = get_user_company_id() AND deleted_at IS NULL
    );

-- Políticas para users (tabla interna)
DROP POLICY IF EXISTS "Users can only see users from their company" ON users;
CREATE POLICY "Users can only see users from their company" ON users
    FOR ALL USING (
        company_id = get_user_company_id() AND deleted_at IS NULL
    );

-- Paso 7: Crear usuario administrador de prueba para cada empresa
-- NOTA: Este paso se hará desde el frontend, pero aquí tienes la estructura

/*
Pasos manuales después de ejecutar este SQL:

1. Crear usuario admin para "Digitalizamos tu PYME":
   - Email: admin@digitalizamostupyme.es
   - Después del registro, ejecutar:
   UPDATE user_profiles 
   SET company_id = (SELECT id FROM companies WHERE name = 'Digitalizamos tu PYME'), role = 'admin'
   WHERE email = 'admin@digitalizamostupyme.es';

2. Crear usuario admin para "SatPCGo":
   - Email: admin@satpcgo.es
   - Después del registro, ejecutar:
   UPDATE user_profiles 
   SET company_id = (SELECT id FROM companies WHERE name = 'SatPCGo'), role = 'admin'
   WHERE email = 'admin@satpcgo.es';

3. Reasignar datos existentes a las empresas correctas:
   - Revisar clients, tickets, services
   - Asignar cada registro a la empresa correcta basándose en lógica de negocio
*/

-- Verificación final
SELECT 
    'companies' as table_name, 
    COUNT(*) as total_records,
    COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active_records
FROM companies
UNION ALL
SELECT 
    'user_profiles' as table_name, 
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_active THEN 1 END) as active_records
FROM user_profiles
UNION ALL
SELECT 
    'clients' as table_name, 
    COUNT(*) as total_records,
    COUNT(CASE WHEN company_id IS NOT NULL THEN 1 END) as with_company
FROM clients
UNION ALL
SELECT 
    'tickets' as table_name, 
    COUNT(*) as total_records,
    COUNT(CASE WHEN company_id IS NOT NULL THEN 1 END) as with_company
FROM tickets
UNION ALL
SELECT 
    'services' as table_name, 
    COUNT(*) as total_records,
    COUNT(CASE WHEN company_id IS NOT NULL THEN 1 END) as with_company
FROM services;
