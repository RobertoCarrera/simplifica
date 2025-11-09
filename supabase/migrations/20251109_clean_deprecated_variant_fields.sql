-- ================================================================
-- Limpieza: Campos deprecados billing_period y base_price
-- Fecha: 2025-11-09
-- Descripción: Establece a NULL los campos antiguos en variantes que
--              ya usan el array `pricing` para evitar inconsistencias.
-- ================================================================

BEGIN;

-- 1) Actualizar filas que ya tienen pricing definido (y al menos 1 elemento)
UPDATE service_variants
SET
  billing_period = NULL,
  base_price = NULL
WHERE pricing IS NOT NULL
  AND jsonb_typeof(pricing) = 'array'
  AND jsonb_array_length(pricing) > 0;

-- 2) (Opcional) También limpiar para cualquier fila cuya pricing contiene objetos con billing_period diferentede NULL
--    (la condición anterior ya cubre la mayoría de los casos, se deja comentada por si se desea ejecutar)
-- UPDATE service_variants
-- SET billing_period = NULL, base_price = NULL
-- WHERE pricing IS NOT NULL AND EXISTS (
--   SELECT 1 FROM jsonb_array_elements(pricing) elem
--   WHERE (elem->>'billing_period') IS NOT NULL
-- );

COMMIT;

-- Verificación rápida: muestra las variantes afectadas
SELECT id, variant_name, billing_period, base_price, jsonb_array_length(pricing) AS pricing_count
FROM service_variants
WHERE pricing IS NOT NULL AND jsonb_array_length(pricing) > 0
ORDER BY display_order;
