-- 27-fix-service-tags-companyid-migration.sql
-- Intenta reparar la migración parcial donde existen columnas `company_id_old` y
-- los índices/constraints apuntan a `company_id_old` en lugar de `company_id`.
--
-- Uso: ejecutar en staging; revisar salidas paso a paso. Hacer backup antes.
-- Resultado esperado: rellenar `company_id` para filas detectadas, eliminar índices/constraints
 DO $$ BEGIN RAISE NOTICE '--- STARTING service_tags company_id repair script ---'; END $$;
-- 0) Información inicial
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'service_tags'
ORDER BY ordinal_position;

SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'service_tags'::regclass;

SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'service_tags';
-- 1) Crear tabla temporal con valores a resolver
DROP TABLE IF EXISTS tmp_service_tags_resolve;
CREATE TEMP TABLE tmp_service_tags_resolve (
  id uuid PRIMARY KEY,
  company_id_old_text text,
  resolved_company_id uuid,
  resolved_via text
) ON COMMIT PRESERVE ROWS;
-- Insertar filas candidatas: preferimos aquellas con company_id IS NULL OR invalid
INSERT INTO tmp_service_tags_resolve (id, company_id_old_text)
SELECT id, (
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_tags' AND column_name='company_id_old') THEN company_id_old::text
    ELSE NULL
  END
) FROM service_tags
WHERE (company_id IS NULL)
LIMIT 10000;
-- 2) Intentar resolver por cast si el texto tiene formato UUID
UPDATE tmp_service_tags_resolve
SET resolved_company_id = company_id_old_text::uuid,
    resolved_via = 'cast_from_old_uuid'
WHERE company_id_old_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
-- Solo actualizar donde aún no resuelto
UPDATE tmp_service_tags_resolve t
SET resolved_company_id = c.id,
    resolved_via = CASE
      WHEN c.id::text = t.company_id_old_text THEN 'matched_on_id'
      WHEN c.slug = t.company_id_old_text THEN 'matched_on_slug'
      WHEN c.legacy_negocio_id = t.company_id_old_text THEN 'matched_on_legacy_negocio_id'
      WHEN c.name = t.company_id_old_text THEN 'matched_on_name'
      ELSE 'matched_other'
    END
FROM companies c
WHERE t.resolved_company_id IS NULL
  AND (
    c.id::text = t.company_id_old_text
    OR c.slug = t.company_id_old_text
    OR (c.legacy_negocio_id IS NOT NULL AND c.legacy_negocio_id = t.company_id_old_text)
    OR c.name = t.company_id_old_text
  );
-- 4) Report counts
SELECT
  (SELECT COUNT(*) FROM tmp_service_tags_resolve) AS candidates_total,
  (SELECT COUNT(*) FROM tmp_service_tags_resolve WHERE resolved_company_id IS NOT NULL) AS resolved_count,
  (SELECT COUNT(*) FROM tmp_service_tags_resolve WHERE resolved_company_id IS NULL) AS unresolved_count;
-- 5) List unresolved rows for manual inspection
SELECT t.id, t.company_id_old_text
FROM tmp_service_tags_resolve t
WHERE t.resolved_company_id IS NULL
LIMIT 200;
-- We'll show any potential duplicates after applying resolved_company_id
WITH updates AS (
  SELECT st.id, st.name, COALESCE(t.resolved_company_id, st.company_id) AS effective_company_id
  FROM service_tags st
  LEFT JOIN tmp_service_tags_resolve t ON st.id = t.id
)
SELECT name, effective_company_id::text AS company_id_text, COUNT(*) AS cnt
FROM updates
GROUP BY name, effective_company_id
HAVING COUNT(*) > 1
LIMIT 200;
-- If no duplicates and at least one resolved, apply changes
DO $$
DECLARE
  dup_count INTEGER;
  resolved INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    WITH updates AS (
      SELECT st.id, st.name, COALESCE(t.resolved_company_id, st.company_id) AS effective_company_id
      FROM service_tags st
      LEFT JOIN tmp_service_tags_resolve t ON st.id = t.id
    )
    SELECT name, effective_company_id FROM updates GROUP BY name, effective_company_id HAVING COUNT(*) > 1
  ) x;

  SELECT COUNT(*) INTO resolved FROM tmp_service_tags_resolve WHERE resolved_company_id IS NOT NULL;

  IF dup_count > 0 THEN
    RAISE NOTICE 'ABORT: Hay % duplicados que impedirían UNIQUE(name, company_id). Revisa la salida previa.', dup_count;
    RAISE NOTICE 'Listado de duplicados mostrado en la sección anterior.';
    RETURN;
  END IF;

  IF resolved = 0 THEN
    RAISE NOTICE 'Nada resuelto automáticamente; no se aplicarán cambios.';
    RETURN;
  END IF;

  RAISE NOTICE 'Aplicando actualizaciones: % filas a actualizar...', resolved;

  -- Apply updates inside a transaction
  BEGIN
    PERFORM pg_advisory_xact_lock(123456789); -- small lock to avoid races

    -- Start explicit transaction
    -- Update service_tags.company_id with resolved ids
    UPDATE service_tags st
    SET company_id = t.resolved_company_id
    FROM tmp_service_tags_resolve t
    WHERE st.id = t.id AND t.resolved_company_id IS NOT NULL;

    RAISE NOTICE 'Updated service_tags.company_id for resolved rows.';

    -- Drop incorrect unique/index referencing company_id_old if exists
    IF EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON i.indrelid = c.oid WHERE c.relname = 'service_tags' AND i.indisunique AND array_to_string(ARRAY(SELECT pg_get_indexdef(i.indexrelid)), '') LIKE '%company_id_old%') THEN
      RAISE NOTICE 'Dropping unique/indexes on company_id_old if present...';
    END IF;

    -- Attempt to drop known constraint and index names safely
    BEGIN
      EXECUTE 'ALTER TABLE service_tags DROP CONSTRAINT IF EXISTS service_tags_name_company_unique';
      EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Could not drop constraint service_tags_name_company_unique: %', SQLERRM;
    END;

    BEGIN
      EXECUTE 'DROP INDEX IF EXISTS service_tags_name_company_unique';
      EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Could not drop index service_tags_name_company_unique: %', SQLERRM;
    END;

    BEGIN
      EXECUTE 'DROP INDEX IF EXISTS idx_service_tags_name_company_unique';
      EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Could not drop index idx_service_tags_name_company_unique: %', SQLERRM;
    END;

    BEGIN
      EXECUTE 'DROP INDEX IF EXISTS idx_service_tags_company_active';
      EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Could not drop index idx_service_tags_company_active: %', SQLERRM;
    END;

    -- Create correct UNIQUE constraint on (name, company_id)
    EXECUTE 'ALTER TABLE service_tags ADD CONSTRAINT service_tags_name_company_unique UNIQUE (name, company_id)';
    RAISE NOTICE 'Created UNIQUE constraint service_tags_name_company_unique (name, company_id)';

    -- Recreate helpful indexes
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_service_tags_company_active ON service_tags(company_id, is_active) WHERE is_active = true';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_service_tags_name_search ON service_tags(company_id, name) WHERE is_active = true';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_service_tags_lookup ON service_tags(company_id, name, is_active)';

    -- Ensure FK points to companies(id)
    BEGIN
      EXECUTE 'ALTER TABLE service_tags DROP CONSTRAINT IF EXISTS service_tags_company_id_fkey';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Could not drop FK: %', SQLERRM;
    END;

    BEGIN
      EXECUTE 'ALTER TABLE service_tags ADD CONSTRAINT service_tags_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE';
      RAISE NOTICE 'Added FK service_tags_company_id_fkey -> companies(id)';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Could not add FK: %', SQLERRM;
    END;

    -- Optionally drop company_id_old column if exists and empty
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_tags' AND column_name='company_id_old') THEN
      -- Only drop if all values are NULL (safety). Otherwise leave for manual review.
      IF (SELECT COUNT(*) FROM service_tags WHERE company_id_old IS NOT NULL) = 0 THEN
        EXECUTE 'ALTER TABLE service_tags DROP COLUMN company_id_old';
        RAISE NOTICE 'Dropped company_id_old column (was empty).';
      ELSE
        RAISE NOTICE 'Leaving company_id_old column in place because it contains data; review manually if you want to drop it.';
      END IF;
    END IF;

    RAISE NOTICE 'All changes applied successfully.';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error applying changes: %', SQLERRM;
  END;
END$$;
 DO $$ BEGIN RAISE NOTICE '--- FINISHED script 27 ---'; END $$;
