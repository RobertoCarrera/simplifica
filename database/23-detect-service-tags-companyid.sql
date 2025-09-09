-- 23-detect-service-tags-companyid.sql
-- Detectar si la columna service_tags.company_id es UUID o character varying
-- y listar filas que no sean convertibles a UUID automáticamente.

-- 1) Tipo actual de la columna
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'service_tags' AND column_name = 'company_id';

-- 2) Contar filas totales y cuántas parecen UUID válidos (regex)
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE company_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS looks_like_uuid
FROM service_tags;

-- 3) Listar filas problemáticas (no convertibles por regex)
SELECT id, company_id
FROM service_tags
WHERE company_id IS NOT NULL
  AND NOT (company_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
LIMIT 200;

-- 4) Comprobar si alguno de esos valores coincide con companies.id text, companies.slug o companies.name
SELECT st.company_id, c.id as company_id_uuid, c.slug, c.name
FROM (
  SELECT DISTINCT company_id FROM service_tags
  WHERE company_id IS NOT NULL
  LIMIT 200
) st
LEFT JOIN companies c ON (
  c.id::text = st.company_id
  OR c.slug = st.company_id
  OR c.name = st.company_id
)
LIMIT 200;

-- Recomendación: revisar las filas listadas antes de intentar conversión automática.
