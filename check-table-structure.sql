-- Verificar estructura actual de service_variants
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'service_variants'
  AND column_name IN ('billing_period', 'base_price', 'pricing')
ORDER BY ordinal_position;
