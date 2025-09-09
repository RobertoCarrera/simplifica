-- 25b-apply-service-tags-companyid-uuid-and-fk-safe.sql
-- Variante más segura del script 25.
-- Crea `company_id_final` (UUID), la rellena desde `company_id_new` o `company_id` cuando sea casteable,
-- valida duplicados y aplica el cambio final solo si las comprobaciones pasan.
-- Hacer backup antes. Ejecutar en staging.

DO $$
DECLARE
  uuid_regex TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  total_rows INTEGER;
  null_final INTEGER;
  dup_count INTEGER;
BEGIN
  RAISE NOTICE '--- START 25b safe apply ---';

  -- 0) Prechecks
  PERFORM 1 FROM information_schema.columns WHERE table_name='service_tags' AND column_name='company_id_new';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'company_id_new column not found. Run conversion script 24 first.';
  END IF;

  -- 1) Create final column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_tags' AND column_name='company_id_final') THEN
    EXECUTE 'ALTER TABLE service_tags ADD COLUMN company_id_final UUID';
    RAISE NOTICE 'Created company_id_final column';
  ELSE
    RAISE NOTICE 'company_id_final already exists, will reuse it';
  END IF;

  -- 2) Populate company_id_final from company_id_new or castable company_id
  EXECUTE format('UPDATE service_tags SET company_id_final = COALESCE(company_id_new, (CASE WHEN company_id::text ~* %L THEN company_id::text::uuid ELSE NULL END))', uuid_regex);

  -- 3) Counts
  SELECT COUNT(*) INTO total_rows FROM service_tags;
  SELECT COUNT(*) INTO null_final FROM service_tags WHERE company_id_final IS NULL;
  RAISE NOTICE 'Total rows: %, rows without final company_id: %', total_rows, null_final;

  IF null_final > 0 THEN
    RAISE NOTICE 'There are % rows without resolved company_id_final. Aborting safe apply so you can inspect them.', null_final;
    RETURN;
  END IF;

  -- 4) Check duplicates on (name, company_id_final)
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT name, company_id_final, COUNT(*) FROM service_tags GROUP BY name, company_id_final HAVING COUNT(*) > 1
  ) x;

  IF dup_count > 0 THEN
    RAISE NOTICE 'ABORT: % duplicate (name, company_id_final) entries found. Resolve duplicates before applying.', dup_count;
    RETURN;
  END IF;

  -- 5) Apply final column swap
  BEGIN
    PERFORM pg_advisory_xact_lock(987654321);

    -- Drop FK if exists on old company_id
    BEGIN
      EXECUTE 'ALTER TABLE service_tags DROP CONSTRAINT IF EXISTS service_tags_company_id_fkey';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Could not drop existing FK (ignored): %', SQLERRM;
    END;

    -- Drop UNIQUE if exists on old columns
    BEGIN
      EXECUTE 'ALTER TABLE service_tags DROP CONSTRAINT IF EXISTS service_tags_name_company_unique';
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Could not drop existing UNIQUE (ignored): %', SQLERRM;
    END;

    -- Drop current company_id column (if exists) and replace with final
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='service_tags' AND column_name='company_id') THEN
      EXECUTE 'ALTER TABLE service_tags DROP COLUMN company_id';
      RAISE NOTICE 'Dropped old company_id column';
    END IF;

    -- Rename final to company_id
    EXECUTE 'ALTER TABLE service_tags RENAME COLUMN company_id_final TO company_id';
    RAISE NOTICE 'Renamed company_id_final -> company_id';

    -- Ensure not null
    EXECUTE 'ALTER TABLE service_tags ALTER COLUMN company_id SET NOT NULL';

    -- Recreate FK and UNIQUE
    EXECUTE 'ALTER TABLE service_tags ADD CONSTRAINT service_tags_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE';
    EXECUTE 'ALTER TABLE service_tags ADD CONSTRAINT service_tags_name_company_unique UNIQUE (name, company_id)';

    RAISE NOTICE 'FK and UNIQUE created, final state applied.';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error applying final changes: %', SQLERRM;
  END;

  RAISE NOTICE '--- FINISH 25b safe apply ---';
END$$;

-- After running: verify with
-- SELECT COUNT(*) FROM service_tags WHERE company_id IS NULL;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'service_tags'::regclass;
