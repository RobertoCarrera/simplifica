-- 33-cleanup-indexes-constraints.sql
-- Elimina índices y constraints obsoletos o problemáticos
-- REVISAR ANTES DE EJECUTAR - HACE CAMBIOS PERMANENTES

-- IMPORTANTE: Ejecutar script 30 primero para detectar problemas

DO $$
DECLARE
  obj_rec RECORD;
  drop_count INTEGER := 0;
  rebuild_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== CLEANUP: Eliminando índices y constraints obsoletos ===';
  
  -- ================================================================
  -- 1. ELIMINAR ÍNDICES OBSOLETOS
  -- ================================================================
  
  -- Índices que referencian columnas temporales/inexistentes
  FOR obj_rec IN
    SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes 
    WHERE schemaname = 'public'
      AND (
        indexdef LIKE '%_old%' 
        OR indexdef LIKE '%_new%' 
        OR indexdef LIKE '%_temp%'
        OR indexdef LIKE '%_backup%'
        OR indexdef LIKE '%_final%'
      )
  LOOP
    RAISE NOTICE 'Eliminando índice obsoleto: %', obj_rec.indexname;
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', obj_rec.schemaname, obj_rec.indexname);
    drop_count := drop_count + 1;
  END LOOP;
  
  -- ================================================================
  -- 2. ELIMINAR CONSTRAINTS OBSOLETOS
  -- ================================================================
  
  -- Constraints que referencian columnas temporales
  FOR obj_rec IN
    SELECT 
      tc.table_name,
      tc.constraint_name,
      tc.constraint_type
    FROM information_schema.table_constraints tc
    JOIN pg_constraint pgc ON pgc.conname = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND (
        pg_get_constraintdef(pgc.oid) LIKE '%_old%' 
        OR pg_get_constraintdef(pgc.oid) LIKE '%_new%'
        OR pg_get_constraintdef(pgc.oid) LIKE '%_temp%'
        OR pg_get_constraintdef(pgc.oid) LIKE '%_backup%'
        OR pg_get_constraintdef(pgc.oid) LIKE '%_final%'
      )
  LOOP
    RAISE NOTICE 'Eliminando constraint obsoleto: %.%', obj_rec.table_name, obj_rec.constraint_name;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', 
                  obj_rec.table_name, obj_rec.constraint_name);
    drop_count := drop_count + 1;
  END LOOP;
  
  -- ================================================================
  -- 3. RECREAR ÍNDICES ÚTILES FALTANTES
  -- ================================================================
  
  -- Índice para service_tags.name (búsquedas por nombre)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'service_tags' 
    AND indexdef LIKE '%name%'
    AND indexdef NOT LIKE '%company_id%' -- excluir unique index
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_service_tags_name ON service_tags(name)';
    RAISE NOTICE 'Creado índice: idx_service_tags_name';
    rebuild_count := rebuild_count + 1;
  END IF;
  
  -- Índice para service_tags.is_active (filtrado por activos)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'service_tags' 
    AND indexdef LIKE '%is_active%'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_service_tags_active ON service_tags(is_active) WHERE is_active = true';
    RAISE NOTICE 'Creado índice: idx_service_tags_active';
    rebuild_count := rebuild_count + 1;
  END IF;
  
  -- Índice compuesto para service_tag_relations (búsquedas bidireccionales)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'service_tag_relations' 
    AND indexdef LIKE '%tag_id%'
    AND indexdef NOT LIKE '%service_id%tag_id%' -- excluir PK
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_service_tag_relations_tag_id ON service_tag_relations(tag_id)';
    RAISE NOTICE 'Creado índice: idx_service_tag_relations_tag_id';
    rebuild_count := rebuild_count + 1;
  END IF;
  
  -- ================================================================
  -- 4. VALIDAR CONSTRAINTS IMPORTANTES
  -- ================================================================
  
  -- Verificar que FK de service_tags.company_id existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'service_tags'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'company_id'
  ) THEN
    RAISE NOTICE 'ADVERTENCIA: FK service_tags.company_id no encontrada. Recreando...';
    EXECUTE 'ALTER TABLE service_tags ADD CONSTRAINT service_tags_company_id_fkey 
             FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE';
    rebuild_count := rebuild_count + 1;
  END IF;
  
  -- Verificar que UNIQUE de service_tags (name, company_id) existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'service_tags'
      AND tc.constraint_type = 'UNIQUE'
      AND tc.constraint_name LIKE '%name%company%'
  ) THEN
    RAISE NOTICE 'ADVERTENCIA: UNIQUE constraint service_tags(name, company_id) no encontrada. Recreando...';
    EXECUTE 'ALTER TABLE service_tags ADD CONSTRAINT service_tags_name_company_unique 
             UNIQUE (name, company_id)';
    rebuild_count := rebuild_count + 1;
  END IF;
  
  -- ================================================================
  -- RESUMEN
  -- ================================================================
  RAISE NOTICE '=== Limpieza de índices/constraints completada ===';
  RAISE NOTICE 'Elementos eliminados: %', drop_count;
  RAISE NOTICE 'Elementos recreados/validados: %', rebuild_count;
  
END$$;

-- ================================================================
-- VERIFICACIÓN POST-LIMPIEZA
-- ================================================================

-- Mostrar todos los índices de las tablas de tags
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
  AND tablename IN ('service_tags', 'service_tag_relations', 'ticket_tag_relations')
ORDER BY tablename, indexname;

-- Mostrar todos los constraints de las tablas de tags
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(pgc.oid) AS constraint_definition
FROM information_schema.table_constraints tc
JOIN pg_constraint pgc ON pgc.conname = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('service_tags', 'service_tag_relations', 'ticket_tag_relations')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;
