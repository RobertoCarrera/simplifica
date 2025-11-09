-- ================================================================
-- FIX URGENTE: Hacer billing_period y base_price NULLABLE
-- ================================================================
-- Esto permite usar el nuevo array pricing sin que fallen los INSERTs

-- Quitar restricción NOT NULL de billing_period
ALTER TABLE service_variants 
ALTER COLUMN billing_period DROP NOT NULL;

-- Quitar restricción NOT NULL de base_price
ALTER TABLE service_variants 
ALTER COLUMN base_price DROP NOT NULL;

-- Verificar que se aplicó correctamente
SELECT 
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'service_variants'
  AND column_name IN ('billing_period', 'base_price');
