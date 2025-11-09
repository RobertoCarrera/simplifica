-- Verificar que el array pricing se está guardando correctamente
SELECT 
  id,
  variant_name,
  billing_period,  -- Debería ser NULL
  base_price,      -- Debería ser NULL
  pricing,         -- Debería tener un array JSON
  jsonb_array_length(pricing) as pricing_count,
  pricing->0->'billing_period' as first_period,
  pricing->0->'base_price' as first_price
FROM service_variants
WHERE service_id = '65f24593-b836-4b5f-91bd-79028c1420d0'
ORDER BY display_order;
