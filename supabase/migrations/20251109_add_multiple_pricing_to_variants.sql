-- ================================================================
-- Migración: Múltiples periodicidades por variante
-- ================================================================
-- Fecha: 2025-11-09
-- Descripción: Permite que una variante tenga múltiples precios 
--              según la periodicidad (mensual, trimestral, anual, etc.)
-- ================================================================

-- 1. Agregar columna pricing como JSONB
ALTER TABLE service_variants 
ADD COLUMN IF NOT EXISTS pricing JSONB;

-- 2. Migrar datos existentes de billing_period + base_price a pricing
UPDATE service_variants 
SET pricing = jsonb_build_array(
  jsonb_build_object(
    'billing_period', billing_period,
    'base_price', base_price,
    'estimated_hours', estimated_hours,
    'cost_price', cost_price,
    'profit_margin', profit_margin,
    'discount_percentage', discount_percentage
  )
)
WHERE pricing IS NULL;

-- 3. Comentar (no eliminar aún) las columnas antiguas para backwards compatibility
COMMENT ON COLUMN service_variants.billing_period IS 'DEPRECATED: Use pricing array instead';
COMMENT ON COLUMN service_variants.base_price IS 'DEPRECATED: Use pricing array instead';

-- 4. Crear índice para búsquedas eficientes en pricing
CREATE INDEX IF NOT EXISTS idx_service_variants_pricing 
ON service_variants USING GIN (pricing);

-- 5. Agregar constraint para validar estructura de pricing
ALTER TABLE service_variants 
ADD CONSTRAINT check_pricing_structure 
CHECK (
  pricing IS NULL OR (
    jsonb_typeof(pricing) = 'array' AND
    jsonb_array_length(pricing) > 0
  )
);

-- Nota: NO eliminamos billing_period y base_price para mantener
-- compatibilidad con código existente durante la transición
