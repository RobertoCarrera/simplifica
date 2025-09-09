-- 26-inspect-service-tags-after-failure.sql
-- Inspecciona la tabla service_tags para detectar columnas renombradas parcialmente,
-- constraints, índices y filas con valores NULL en columnas de company_id.

-- 1) Columnas y tipos
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'service_tags'
ORDER BY ordinal_position;

-- 2) Constraints (FKs, PKs, UQ)
SELECT
  con.constraint_name,
  con.constraint_type,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_field
FROM information_schema.table_constraints con
LEFT JOIN information_schema.key_column_usage kcu
  ON con.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu
  ON con.constraint_name = ccu.constraint_name
WHERE con.table_name = 'service_tags';

-- 3) Indexes on service_tags
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'service_tags';

-- 4) Any columns named company_id_old / company_id_new?
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name = 'service_tags'
  AND column_name IN ('company_id', 'company_id_old', 'company_id_new');

-- 5) Safe extraction of rows: create a temp table and populate conditionally
-- This avoids parse-time errors if company_id_old/company_id_new don't exist
DO $$
BEGIN
  -- Create temp table for inspection results
  CREATE TEMP TABLE IF NOT EXISTS tmp_service_tags_inspect (
    id uuid,
    name text,
    company_id_text text,
    company_id_old_text text,
    company_id_new_text text
  ) ON COMMIT PRESERVE ROWS;

  -- Clean any previous data in this session
  TRUNCATE TABLE tmp_service_tags_inspect;

  -- Always insert id, name, company_id
  EXECUTE 'INSERT INTO tmp_service_tags_inspect (id, name, company_id_text)
           SELECT id, name, company_id::text FROM service_tags LIMIT 200';

  -- If company_id_old exists, populate that column
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_tags' AND column_name='company_id_old') THEN
    EXECUTE 'UPDATE tmp_service_tags_inspect t SET company_id_old_text = s.company_id_old::text FROM (SELECT id, company_id_old::text FROM service_tags LIMIT 200) s WHERE t.id = s.id';
  END IF;

  -- If company_id_new exists, populate that column
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_tags' AND column_name='company_id_new') THEN
    EXECUTE 'UPDATE tmp_service_tags_inspect t SET company_id_new_text = s.company_id_new::text FROM (SELECT id, company_id_new::text FROM service_tags LIMIT 200) s WHERE t.id = s.id';
  END IF;
END$$;

-- Show the inspection rows (temp table persists for this session)
SELECT * FROM tmp_service_tags_inspect LIMIT 200;

-- 6) Count rows where company_id IS NULL
SELECT COUNT(*) AS rows_with_company_id_null FROM service_tags WHERE company_id IS NULL;

-- 7) Count rows where company_id_old IS NULL (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_tags' AND column_name='company_id_old') THEN
    RAISE NOTICE 'company_id_old exists: will count NULLs';
    PERFORM (
      SELECT COUNT(*) FROM service_tags WHERE company_id_old IS NULL
    );
  ELSE
    RAISE NOTICE 'company_id_old does not exist';
  END IF;
END$$;

-- 8) Show triggers that might touch service_tags
SELECT tgname, tgenabled, pg_get_triggerdef(t.oid)
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'service_tags' AND NOT t.tgisinternal;

-- 9) Check if service_tags has a NOT NULL constraint on company_id_old via pg_constraint
SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'service_tags'::regclass;

-- End of inspection script
