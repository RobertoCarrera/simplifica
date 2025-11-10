-- =====================================================
-- Script de diagnóstico y corrección para presupuestos
-- Fecha: 2025-11-10
-- Descripción: Verifica y corrige variant_id y billing_period en quote_items
-- =====================================================

-- 1. VERIFICAR: Estructura de la tabla
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'quote_items'
  AND column_name IN ('variant_id', 'billing_period', 'service_id', 'product_id')
ORDER BY ordinal_position;

-- 2. VERIFICAR: Presupuestos con items sin variante pero con servicio que tiene variantes
SELECT 
  q.id as quote_id,
  q.quote_number,
  qi.line_number,
  qi.description,
  qi.service_id,
  qi.variant_id,
  qi.billing_period,
  s.name as service_name,
  s.has_variants,
  COUNT(sv.id) as available_variants
FROM quotes q
JOIN quote_items qi ON q.id = qi.quote_id
LEFT JOIN services s ON qi.service_id = s.id
LEFT JOIN service_variants sv ON s.id = sv.service_id AND sv.is_active = true
WHERE qi.service_id IS NOT NULL
  AND qi.variant_id IS NULL
  AND s.has_variants = true
GROUP BY q.id, q.quote_number, qi.line_number, qi.description, qi.service_id, qi.variant_id, qi.billing_period, s.name, s.has_variants
ORDER BY q.created_at DESC
LIMIT 20;

-- 3. CORREGIR: Presupuesto específico (ajustar IDs según necesites)
-- Primero busca las variantes disponibles para el servicio
SELECT 
  sv.id as variant_id,
  sv.variant_name,
  sv.billing_period,
  sv.base_price,
  s.name as service_name
FROM service_variants sv
JOIN services s ON sv.service_id = s.id
WHERE s.id = '65f24593-b836-4b5f-91bd-79028c1420d0'  -- ID del servicio "Mantenimiento Web WP"
  AND sv.is_active = true
ORDER BY sv.sort_order;

-- 4. APLICAR CORRECCIÓN (ejecutar después de confirmar el variant_id correcto)
-- IMPORTANTE: Reemplaza 'VARIANT_ID_AQUI' con el ID real de la variante Founders
/*
BEGIN;

-- Actualizar el item con la variante correcta
UPDATE quote_items
SET 
  variant_id = 'VARIANT_ID_AQUI',  -- Poner el ID de la variante Founders
  billing_period = 'monthly',       -- Ajustar según la variante (monthly/annually/one-time)
  updated_at = NOW()
WHERE quote_id = '17e8f654-2d07-4f5a-8158-e8ced8a5ccea'
  AND line_number = 1;

-- Actualizar la recurrencia del presupuesto
UPDATE quotes
SET 
  recurrence_type = 'monthly',      -- Ajustar según billing_period
  recurrence_interval = 1,
  recurrence_day = 1,               -- Primer día del mes
  updated_at = NOW()
WHERE id = '17e8f654-2d07-4f5a-8158-e8ced8a5ccea';

-- Verificar cambios
SELECT 
  qi.line_number,
  qi.description,
  qi.variant_id,
  qi.billing_period,
  sv.variant_name,
  q.recurrence_type
FROM quote_items qi
LEFT JOIN service_variants sv ON qi.variant_id = sv.id
JOIN quotes q ON qi.quote_id = q.id
WHERE qi.quote_id = '17e8f654-2d07-4f5a-8158-e8ced8a5ccea';

-- Si todo está bien, ejecutar COMMIT. Si no, ejecutar ROLLBACK
COMMIT;
-- ROLLBACK;
*/

-- 5. VERIFICAR: Estado final del presupuesto
SELECT 
  q.id,
  q.quote_number,
  q.recurrence_type,
  q.recurrence_interval,
  q.recurrence_day,
  qi.line_number,
  qi.description,
  qi.variant_id,
  qi.billing_period,
  sv.variant_name
FROM quotes q
JOIN quote_items qi ON q.id = qi.quote_id
LEFT JOIN service_variants sv ON qi.variant_id = sv.id
WHERE q.id = '17e8f654-2d07-4f5a-8158-e8ced8a5ccea'
ORDER BY qi.line_number;

-- =====================================================
-- SCRIPTS ADICIONALES
-- =====================================================

-- Contar presupuestos con/sin variantes seleccionadas
SELECT 
  CASE 
    WHEN qi.variant_id IS NOT NULL THEN 'Con variante'
    WHEN qi.service_id IS NOT NULL THEN 'Solo servicio'
    WHEN qi.product_id IS NOT NULL THEN 'Producto'
    ELSE 'Otro'
  END as tipo_item,
  COUNT(*) as total_items,
  COUNT(DISTINCT qi.quote_id) as presupuestos_afectados
FROM quote_items qi
GROUP BY 
  CASE 
    WHEN qi.variant_id IS NOT NULL THEN 'Con variante'
    WHEN qi.service_id IS NOT NULL THEN 'Solo servicio'
    WHEN qi.product_id IS NOT NULL THEN 'Producto'
    ELSE 'Otro'
  END;

-- Ver distribución de periodicidades
SELECT 
  COALESCE(billing_period, 'sin_periodicidad') as periodo,
  COUNT(*) as items,
  COUNT(DISTINCT quote_id) as presupuestos
FROM quote_items
GROUP BY billing_period
ORDER BY items DESC;

-- =====================================================
-- FIN
-- =====================================================
