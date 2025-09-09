-- 28-detection-and-counts-safe.sql
-- Diagnósticos seguros para service_tags: usa casts a text antes de aplicar regex
-- Ejecutar en Supabase SQL editor o psql y pegar la salida aquí.

-- 1) Columnas y tipos
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'service_tags'
ORDER BY ordinal_position;

-- 2) Constraints y definiciones
SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'service_tags'::regclass;

-- 3) Índices
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'service_tags';

-- 4) Muestra de filas (incluye company_id y company_id_old si existe)
SELECT id, name, company_id::text AS company_id_text,
  (CASE WHEN EXISTS (
     SELECT 1 FROM information_schema.columns 
     WHERE table_name='service_tags' AND column_name='company_id_old'
   ) THEN company_id_old::text ELSE NULL END) AS company_id_old_text
FROM service_tags
ORDER BY created_at NULLS LAST
LIMIT 50;

-- 5) Conteos seguros (con cast antes del regex)
SELECT
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE company_id IS NULL) AS company_id_null,
  COUNT(*) FILTER (WHERE company_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') AS company_id_looks_uuid
FROM service_tags;

-- 6) Lista de filas cuyo company_id_text parece UUID (muestra)
SELECT id, name, company_id::text AS company_id_text
FROM service_tags
WHERE company_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
LIMIT 200;

-- 7) Filas con company_id_old no-null (si existe)
DO $$
DECLARE
  rec RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_tags' AND column_name='company_id_old') THEN
    RAISE NOTICE 'company_id_old exists: showing up to 200 rows where it is NOT NULL';
    FOR rec IN SELECT id, name, company_id_old::text AS company_id_old_text FROM service_tags WHERE company_id_old IS NOT NULL LIMIT 200 LOOP
      RAISE NOTICE '% | % | %', rec.id, rec.name, rec.company_id_old_text;
    END LOOP;
  ELSE
    RAISE NOTICE 'company_id_old does not exist';
  END IF;
END$$;

-- Fin del script
