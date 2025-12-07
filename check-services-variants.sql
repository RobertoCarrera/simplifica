-- ============================================
-- DIAGNÓSTICO: Servicios y Variantes
-- ============================================

-- 1. Ver todos los servicios con has_variants
SELECT 
  id,
  name,
  base_price,
  estimated_hours,
  has_variants,
  is_active
FROM services
WHERE deleted_at IS NULL
ORDER BY has_variants DESC, name;

-- 2. Ver variantes existentes con sus precios
SELECT 
  sv.id as variant_id,
  s.name as service_name,
  sv.variant_name,
  sv.pricing,
  sv.pricing->0->>'base_price' as first_price,
  sv.is_active
FROM service_variants sv
JOIN services s ON s.id = sv.service_id
WHERE sv.is_active = true
ORDER BY s.name, sv.variant_name;

-- 3. Servicios con has_variants=true pero sin variantes
SELECT 
  s.id,
  s.name,
  s.has_variants,
  (SELECT COUNT(*) FROM service_variants sv WHERE sv.service_id = s.id AND sv.is_active = true) as variant_count
FROM services s
WHERE s.deleted_at IS NULL
  AND s.has_variants = true
ORDER BY s.name;

-- 4. Ver estructura de pricing en variantes
SELECT 
  s.name as service_name,
  sv.variant_name,
  sv.pricing,
  jsonb_typeof(sv.pricing) as pricing_type,
  CASE 
    WHEN sv.pricing IS NULL THEN 'NULL'
    WHEN jsonb_typeof(sv.pricing) = 'array' THEN 'Array with ' || jsonb_array_length(sv.pricing) || ' entries'
    ELSE 'Other: ' || jsonb_typeof(sv.pricing)
  END as pricing_status,
  sv.pricing->0->>'base_price' as first_base_price,
  sv.pricing->0->>'billing_period' as first_billing_period
FROM service_variants sv
JOIN services s ON s.id = sv.service_id
WHERE sv.is_active = true;
