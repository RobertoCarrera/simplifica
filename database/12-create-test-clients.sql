-- ================================================
-- SCRIPT: CREAR CLIENTES DE TESTING
-- ================================================
-- Este script crea clientes de prueba para los 2 usuarios:
-- - 10 clientes para Alberto Dominguez (SatPCGo)
-- - 5 clientes para Roberto Carrera (Anscarr)

DO $$
DECLARE
    satpcgo_company_id UUID := 'c0976b79-a10a-4e94-9f1d-f78afcdbee2a'::UUID;
    anscarr_company_id UUID := '6c1a6e99-be3f-4bae-9398-3b892082c7c6'::UUID;
    i INTEGER;
BEGIN
    RAISE NOTICE 'Creando clientes para SatPCGo (ID: %) y Anscarr (ID: %)', satpcgo_company_id, anscarr_company_id;
    
    -- ==============================================
    -- CLIENTES PARA ALBERTO DOMINGUEZ (SATPCGO) - 10 clientes
    -- ==============================================
    
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
    
    RAISE NOTICE '✅ Creados 10 clientes para SatPCGo (Alberto Dominguez)';
    
    -- ==============================================
    -- CLIENTES PARA ROBERTO CARRERA (ANSCARR) - 5 clientes
    -- ==============================================
    
    INSERT INTO public.clients (company_id, name, email, phone, address, created_at, updated_at) VALUES
    (anscarr_company_id, 'Lucía Martín Álvarez', 'lucia.martin@email.com', '666200001', '{"street": "Calle Real 10", "city": "Sevilla", "postal_code": "41001"}'::jsonb, NOW(), NOW()),
    (anscarr_company_id, 'Antonio Guerrero Ramos', 'antonio.guerrero@email.com', '666200002', '{"street": "Plaza del Pilar 5", "city": "Zaragoza", "postal_code": "50001"}'::jsonb, NOW(), NOW()),
    (anscarr_company_id, 'Isabel Vázquez Ortega', 'isabel.vazquez@email.com', '666200003', '{"street": "Calle Larios 22", "city": "Málaga", "postal_code": "29015"}'::jsonb, NOW(), NOW()),
    (anscarr_company_id, 'Roberto Delgado Silva', 'roberto.delgado@email.com', '666200004', '{"street": "Avenida de América 33", "city": "Vigo", "postal_code": "36201"}'::jsonb, NOW(), NOW()),
    (anscarr_company_id, 'Cristina Navarro Campos', 'cristina.navarro@email.com', '666200005', '{"street": "Paseo del Prado 18", "city": "Madrid", "postal_code": "28014"}'::jsonb, NOW(), NOW());
    
    RAISE NOTICE '✅ Creados 5 clientes para Anscarr (Roberto Carrera)';
    
END $$;

-- ==============================================
-- VERIFICACIÓN DE CLIENTES CREADOS
-- ==============================================

SELECT '=== RESUMEN DE CLIENTES POR EMPRESA ===' as seccion;

SELECT 
    c.name as empresa,
    COUNT(cl.id) as total_clientes,
    array_agg(cl.name ORDER BY cl.name) as nombres_clientes
FROM public.companies c
LEFT JOIN public.clients cl ON c.id = cl.company_id AND cl.deleted_at IS NULL
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name
ORDER BY c.name;

-- Detalle de clientes por empresa
SELECT 
    '=== DETALLE DE CLIENTES ===' as seccion
UNION ALL
SELECT 
    CONCAT('--- ', c.name, ' ---') as seccion
FROM public.companies c
WHERE c.deleted_at IS NULL
ORDER BY seccion;

SELECT 
    CONCAT('🏢 ', c.name) as empresa,
    CONCAT('👤 ', cl.name) as cliente,
    cl.email,
    cl.phone,
    cl.address->>'city' as ciudad
FROM public.clients cl
JOIN public.companies c ON cl.company_id = c.id
WHERE cl.deleted_at IS NULL AND c.deleted_at IS NULL
ORDER BY c.name, cl.name;
