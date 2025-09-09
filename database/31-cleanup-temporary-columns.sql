-- 31-cleanup-temporary-columns.sql
-- Elimina columnas temporales detectadas como seguras para borrar
-- tras confirmación manual de que ya no se necesitan.
-- REVISAR ANTES DE EJECUTAR - HACE CAMBIOS PERMANENTES

-- IMPORTANTE: Ejecutar script 30 primero para detectar qué hay

DO $$
DECLARE
  col_count INTEGER;
  table_rec RECORD;
  temp_columns TEXT[] := ARRAY[
    'company_id_old',
    'company_id_new', 
    'company_id_final',
    'company_id_temp'
  ];
  col_name TEXT;
  drop_command TEXT;
  tables_to_check TEXT[] := ARRAY[
    'service_tags',
    'service_categories', 
    'services',
    'tickets',
    'clients'
  ];
  target_table TEXT;
BEGIN
  RAISE NOTICE '=== CLEANUP: Eliminando columnas temporales ===';
  
  -- Verificar y eliminar columnas temporales en cada tabla
  FOREACH target_table IN ARRAY tables_to_check
  LOOP
    RAISE NOTICE 'Verificando tabla: %', target_table;
    
    FOREACH col_name IN ARRAY temp_columns
    LOOP
      -- Verificar si la columna existe
      SELECT COUNT(*) INTO col_count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND information_schema.columns.table_name = target_table
        AND information_schema.columns.column_name = col_name;
      
      IF col_count > 0 THEN
        RAISE NOTICE 'Encontrada columna temporal: %.%', target_table, col_name;
        
        -- Verificar si hay datos en la columna (precaución extra)
        EXECUTE format('SELECT COUNT(*) FROM %I WHERE %I IS NOT NULL', 
                      target_table, col_name) INTO col_count;
        
        IF col_count > 0 THEN
          RAISE NOTICE 'ATENCIÓN: %.% tiene % valores no-null. ¿Seguro que quieres eliminarla?', 
                      target_table, col_name, col_count;
          -- Comentar la siguiente línea para hacer dry-run sin eliminar
          EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS %I', target_table, col_name);
          RAISE NOTICE 'Eliminada: %.%', target_table, col_name;
        ELSE
          RAISE NOTICE '%.% está vacía, eliminando...', target_table, col_name;
          EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS %I', target_table, col_name);
          RAISE NOTICE 'Eliminada: %.%', target_table, col_name;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE '=== Limpieza de columnas temporales completada ===';
END$$;

-- Verificación post-limpieza
SELECT 
  table_name,
  column_name,
  'STILL EXISTS' AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    column_name LIKE '%_old' 
    OR column_name LIKE '%_new' 
    OR column_name LIKE '%_temp' 
    OR column_name LIKE '%_final'
  )
ORDER BY table_name, column_name;
