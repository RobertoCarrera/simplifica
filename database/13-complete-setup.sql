-- ================================================
-- SCRIPT COMBINADO: LIMPIEZA COMPLETA Y SETUP
-- ================================================
-- Este script ejecuta todo el proceso de limpieza y creación:
-- 1. Limpia users y clients
-- 2. Crea los 2 usuarios específicos
-- 3. Crea clientes de testing (10 + 5)

-- PASO 1: LIMPIAR TABLAS
\echo '🧹 PASO 1: Limpiando tablas users y clients...'

UPDATE public.users 
SET deleted_at = NOW()
WHERE deleted_at IS NULL;

UPDATE public.clients 
SET deleted_at = NOW()
WHERE deleted_at IS NULL;

\echo '✅ Limpieza completada'

-- PASO 2: CREAR USUARIOS
\echo '👥 PASO 2: Creando usuarios limpios...'

DO $$
DECLARE
    satpcgo_company_id UUID;
    anscarr_company_id UUID;
    alberto_user_id UUID := '1e816ec8-4a5d-4e43-806a-6c7cf2ec6950'::UUID;
    alberto_company_id UUID := 'c0976b79-a10a-4e94-9f1d-f78afcdbee2a'::UUID;
    roberto_user_id UUID := 'aab570db-5165-4946-9b90-c2991d5ad183'::UUID;
    roberto_company_id UUID := '6c1a6e99-be3f-4bae-9398-3b892082c7c6'::UUID;
BEGIN
    -- Verificar/Crear empresa SatPCGo
    SELECT id INTO satpcgo_company_id 
    FROM public.companies 
    WHERE id = alberto_company_id AND deleted_at IS NULL;
    
    IF satpcgo_company_id IS NULL THEN
        INSERT INTO public.companies (
            id, name, slug, website, legacy_negocio_id, created_at, updated_at
        ) VALUES (
            alberto_company_id, 'SatPCGo', 'satpcgo', 'https://satpcgo.es', '1',
            '2024-10-30 18:07:00+00'::timestamp, NOW()
        );
    END IF;
    
    -- Verificar/Crear empresa Anscarr
    SELECT id INTO anscarr_company_id 
    FROM public.companies 
    WHERE id = roberto_company_id AND deleted_at IS NULL;
    
    IF anscarr_company_id IS NULL THEN
        INSERT INTO public.companies (
            id, name, slug, website, legacy_negocio_id, created_at, updated_at
        ) VALUES (
            roberto_company_id, 'Anscarr', 'anscarr', 'https://anscarr.es', '2', NOW(), NOW()
        );
    END IF;
    
    -- Crear Alberto Dominguez (usuario real)
    INSERT INTO public.users (
        id, company_id, email, name, role, active, permissions, created_at, updated_at
    ) VALUES (
        alberto_user_id, alberto_company_id, 'info@satpcgo.es', 'Alberto Dominguez', 'owner', true,
        '{"moduloFacturas": true, "moduloMaterial": true, "moduloServicios": true, "moduloPresupuestos": true}'::jsonb,
        '2024-10-30 18:07:00+00'::timestamp, '2025-09-08 11:18:27.934396+00'::timestamp
    ) ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id, email = EXCLUDED.email, name = EXCLUDED.name,
        role = EXCLUDED.role, active = EXCLUDED.active, permissions = EXCLUDED.permissions,
        updated_at = NOW(), deleted_at = NULL;
    
    -- Crear Roberto Carrera (usuario de desarrollo)
    INSERT INTO public.users (
        id, company_id, email, name, role, active, permissions, created_at, updated_at
    ) VALUES (
        roberto_user_id, roberto_company_id, 'robertocarreratech@gmail.com', 'Roberto Carrera Santa Maria', 'owner', true,
        '{"moduloFacturas": true, "moduloMaterial": true, "moduloServicios": true, "moduloPresupuestos": true}'::jsonb,
        '2025-09-08 11:16:58.191565+00'::timestamp, '2025-09-08 11:18:17.682199+00'::timestamp
    ) ON CONFLICT (id) DO UPDATE SET
        company_id = EXCLUDED.company_id, email = EXCLUDED.email, name = EXCLUDED.name,
        role = EXCLUDED.role, active = EXCLUDED.active, permissions = EXCLUDED.permissions,
        updated_at = NOW(), deleted_at = NULL;
        
END $$;

\echo '✅ Usuarios creados correctamente'

-- PASO 3: CREAR CLIENTES
\echo '🏢 PASO 3: Creando clientes de testing...'

DO $$
DECLARE
    satpcgo_company_id UUID := 'c0976b79-a10a-4e94-9f1d-f78afcdbee2a'::UUID;
    anscarr_company_id UUID := '6c1a6e99-be3f-4bae-9398-3b892082c7c6'::UUID;
BEGIN
    
    -- Clientes para SatPCGo (Alberto) - 10 clientes
    INSERT INTO public.clients (company_id, name, email, phone, address, created_at, updated_at) VALUES
    (satpcgo_company_id, 'María García López', 'maria.garcia@email.com', '666123001', '{"street": "Calle Mayor 15", "city": "Madrid", "postal_code": "28001"}'::jsonb, NOW(), NOW()),
    (satpcgo_company_id, 'José Martínez Ruiz', 'jose.martinez@email.com', '666123002', '{"street": "Avenida de la Paz 23", "city": "Barcelona", "postal_code": "08001"}'::jsonb, NOW(), NOW()),
    (satpcgo_company_id, 'Ana Fernández Torres', 'ana.fernandez@email.com', '666123003', '{"street": "Plaza España 8", "city": "Valencia", "postal_code": "46001"}'::jsonb, NOW(), NOW()),
    (satpcgo_company_id, 'Carlos Rodríguez Vega', 'carlos.rodriguez@email.com', '666123004', '{"street": "Calle Alcalá 45", "city": "Madrid", "postal_code": "28014"}'::jsonb, NOW(), NOW()),
    (satpcgo_company_id, 'Laura Sánchez Moreno', 'laura.sanchez@email.com', '666123005', '{"street": "Gran Vía 67", "city": "Bilbao", "postal_code": "48001"}'::jsonb, NOW(), NOW()),
    (satpcgo_company_id, 'Miguel Jiménez Castro', 'miguel.jimenez@email.com', '666123006', '{"street": "Rambla Catalunya 12", "city": "Barcelona", "postal_code": "08007"}'::jsonb, NOW(), NOW()),
    (satpcgo_company_id, 'Elena Romero Díaz', 'elena.romero@email.com', '666123007', '{"street": "Calle Serrano 89", "city": "Madrid", "postal_code": "28006"}'::jsonb, NOW(), NOW()),
    (satpcgo_company_id, 'David López Herrera', 'david.lopez@email.com', '666123008', '{"street": "Paseo de Gracia 34", "city": "Barcelona", "postal_code": "08008"}'::jsonb, NOW(), NOW()),
    (satpcgo_company_id, 'Carmen Ruiz Peña', 'carmen.ruiz@email.com', '666123009', '{"street": "Calle Goya 56", "city": "Madrid", "postal_code": "28001"}'::jsonb, NOW(), NOW()),
    (satpcgo_company_id, 'Francisco Morales Gil', 'francisco.morales@email.com', '666123010', '{"street": "Avenida Diagonal 78", "city": "Barcelona", "postal_code": "08018"}'::jsonb, NOW(), NOW());
    
    -- Clientes para Anscarr (Roberto) - 5 clientes
    INSERT INTO public.clients (company_id, name, email, phone, address, created_at, updated_at) VALUES
    (anscarr_company_id, 'Lucía Martín Álvarez', 'lucia.martin@email.com', '666200001', '{"street": "Calle Real 10", "city": "Sevilla", "postal_code": "41001"}'::jsonb, NOW(), NOW()),
    (anscarr_company_id, 'Antonio Guerrero Ramos', 'antonio.guerrero@email.com', '666200002', '{"street": "Plaza del Pilar 5", "city": "Zaragoza", "postal_code": "50001"}'::jsonb, NOW(), NOW()),
    (anscarr_company_id, 'Isabel Vázquez Ortega', 'isabel.vazquez@email.com', '666200003', '{"street": "Calle Larios 22", "city": "Málaga", "postal_code": "29015"}'::jsonb, NOW(), NOW()),
    (anscarr_company_id, 'Roberto Delgado Silva', 'roberto.delgado@email.com', '666200004', '{"street": "Avenida de América 33", "city": "Vigo", "postal_code": "36201"}'::jsonb, NOW(), NOW()),
    (anscarr_company_id, 'Cristina Navarro Campos', 'cristina.navarro@email.com', '666200005', '{"street": "Paseo del Prado 18", "city": "Madrid", "postal_code": "28014"}'::jsonb, NOW(), NOW());
    
END $$;

\echo '✅ Clientes creados correctamente'

-- VERIFICACIÓN FINAL
\echo '📊 VERIFICACIÓN FINAL:'

SELECT 
    '=== RESUMEN FINAL ===' as resultado
UNION ALL
SELECT 
    CONCAT('👥 Usuarios activos: ', COUNT(*)) as resultado
FROM public.users
WHERE deleted_at IS NULL
UNION ALL
SELECT 
    CONCAT('🏢 Empresas activas: ', COUNT(*)) as resultado
FROM public.companies
WHERE deleted_at IS NULL
UNION ALL
SELECT 
    CONCAT('👤 Clientes activos: ', COUNT(*)) as resultado
FROM public.clients
WHERE deleted_at IS NULL;

-- Detalle por empresa
SELECT 
    c.name as empresa,
    u.name as usuario,
    u.email as email_usuario,
    COUNT(cl.id) as total_clientes
FROM public.companies c
JOIN public.users u ON c.id = u.company_id AND u.deleted_at IS NULL
LEFT JOIN public.clients cl ON c.id = cl.company_id AND cl.deleted_at IS NULL
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name, u.id, u.name, u.email
ORDER BY c.name;
