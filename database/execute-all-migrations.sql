-- =============================================
-- SCRIPT PARA APLICAR TODOS LOS CAMBIOS MULTI-TENANT
-- =============================================

-- Ejecutar en este orden:

-- 1. Actualizar tabla companies existente
\i update-existing-companies.sql

-- 2. Migrar datos existentes
\i migrate-existing-data.sql

-- 3. Verificación final
SELECT 
  'RESUMEN DE MIGRACIÓN' as tipo,
  '' as detalle
UNION ALL
SELECT 
  'Companies activas', 
  COUNT(*)::text 
FROM companies 
WHERE is_active = true
UNION ALL
SELECT 
  'User profiles creados', 
  COUNT(*)::text 
FROM user_profiles
UNION ALL
SELECT 
  'Customers con company_id', 
  COUNT(*)::text 
FROM customers 
WHERE company_id IS NOT NULL
UNION ALL
SELECT 
  'Tickets con company_id', 
  COUNT(*)::text 
FROM tickets 
WHERE company_id IS NOT NULL
UNION ALL
SELECT 
  'Services con company_id', 
  COUNT(*)::text 
FROM services 
WHERE company_id IS NOT NULL;

-- 4. Mostrar empresas disponibles
SELECT 
  'EMPRESAS DISPONIBLES' as info,
  id,
  name,
  slug,
  subscription_tier,
  is_active
FROM companies
ORDER BY created_at;
