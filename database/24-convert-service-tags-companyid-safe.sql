-- 24-convert-service-tags-companyid-safe.sql
-- Intenta convertir la columna service_tags.company_id a UUID de forma segura
-- Solo convertirá las filas cuyo company_id cumpla la regex UUID.
-- Recomendado: ejecutar después de revisar los resultados del script 23.

BEGIN;

-- 1) Agregar nueva columna temporal con tipo UUID
ALTER TABLE service_tags ADD COLUMN IF NOT EXISTS company_id_new UUID;

-- 2) Copiar valores convertibles
UPDATE service_tags
SET company_id_new = company_id::uuid
WHERE company_id IS NOT NULL
  AND company_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 3) Verificar cuántas filas quedaron sin convertir
SELECT
  COUNT(*) AS total_rows,
  COUNT(company_id_new) AS converted_rows,
  COUNT(*) - COUNT(company_id_new) AS not_converted
FROM service_tags;

-- 4) Si converted_rows > 0, reemplazar columna y recrear constraint en pasos seguros
-- NOTA: No se hace DROP de la columna original hasta que el DBA confirme los resultados.

COMMIT;

-- INSTRUCCIONES:
-- 1) Revisar los contadores y las filas no convertidas (script 23) tras ejecutar este script.
-- 2) Si todo ok, ejecutar el script 25 para aplicar el cambio de tipo y agregar FK.
