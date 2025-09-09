-- 35-final-cleanup-master.sql
-- Script maestro para ejecutar toda la limpieza en orden correcto
-- Incluye validaciones y rollback en caso de problemas

-- INSTRUCCIONES:
-- 1. Hacer BACKUP completo antes de ejecutar
-- 2. Ejecutar en entorno de staging primero
-- 3. Revisar todos los NOTICE y resultados
-- 4. Ejecutar secciones individualmente si prefieres control granular

BEGIN;

-- ================================================================
-- FASE 1: DETECCIÓN (Solo lectura)
-- ================================================================
SELECT 'FASE 1: DETECTANDO ELEMENTOS A LIMPIAR' AS fase;

-- Guardar estado inicial
CREATE TEMP TABLE cleanup_stats_initial AS
SELECT 
  'service_tags' AS tabla,
  COUNT(*) AS registros,
  COUNT(*) FILTER (WHERE is_active = true) AS activos
FROM service_tags
UNION ALL
SELECT 
  'service_tag_relations' AS tabla,
  COUNT(*) AS registros,
  NULL AS activos
FROM service_tag_relations;

-- Detectar problemas
SELECT 'Problemas detectados:' AS status;

-- Columnas temporales
SELECT 
  'Columnas temporales: ' || COUNT(*) AS problema
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name LIKE '%_old' OR column_name LIKE '%_new' OR column_name LIKE '%_temp');

-- Datos huérfanos
SELECT 
  'Service tags huérfanos: ' || COUNT(*) AS problema
FROM service_tags st
WHERE NOT EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = st.company_id AND c.deleted_at IS NULL
);

-- Relaciones huérfanas
SELECT 
  'Relaciones huérfanas: ' || COUNT(*) AS problema
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM services s WHERE s.id = str.service_id AND s.deleted_at IS NULL
)
OR NOT EXISTS (
  SELECT 1 FROM service_tags st WHERE st.id = str.tag_id AND st.is_active = true
);

-- ================================================================
-- FASE 2: LIMPIEZA DE DATOS HUÉRFANOS
-- ================================================================
SELECT 'FASE 2: LIMPIANDO DATOS HUÉRFANOS' AS fase;

-- Eliminar relaciones que apuntan a servicios eliminados
DELETE FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM services s 
  WHERE s.id = str.service_id AND s.deleted_at IS NULL
);

-- Eliminar relaciones que apuntan a tags inactivos
DELETE FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM service_tags st 
  WHERE st.id = str.tag_id AND st.is_active = true
);

-- Eliminar tags que apuntan a companies inexistentes
DELETE FROM service_tags st
WHERE NOT EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = st.company_id AND c.deleted_at IS NULL
);

SELECT 'Datos huérfanos eliminados' AS status;

-- ================================================================
-- FASE 3: ELIMINAR DUPLICADOS
-- ================================================================
SELECT 'FASE 3: ELIMINANDO DUPLICADOS' AS fase;

-- Eliminar duplicados en service_tags (mantener el más reciente)
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY name, company_id 
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM service_tags
)
DELETE FROM service_tag_relations 
WHERE tag_id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY name, company_id 
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM service_tags
)
DELETE FROM service_tags 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

SELECT 'Duplicados eliminados' AS status;

-- ================================================================
-- FASE 4: LIMPIEZA DE COLUMNAS TEMPORALES
-- ================================================================
SELECT 'FASE 4: ELIMINANDO COLUMNAS TEMPORALES' AS fase;

-- Solo eliminar si están vacías o son claramente temporales
DO $$
DECLARE
  col_name TEXT;
  table_name TEXT;
  temp_columns TEXT[] := ARRAY['company_id_old', 'company_id_new', 'company_id_final'];
  tables_to_check TEXT[] := ARRAY['service_tags'];
  col_count INTEGER;
BEGIN
  FOREACH table_name IN ARRAY tables_to_check
  LOOP
    FOREACH col_name IN ARRAY temp_columns
    LOOP
      -- Verificar si existe
      SELECT COUNT(*) INTO col_count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = final_cleanup_master.table_name
        AND column_name = col_name;
      
      IF col_count > 0 THEN
        -- Verificar si está vacía
        EXECUTE format('SELECT COUNT(*) FROM %I WHERE %I IS NOT NULL', 
                      table_name, col_name) INTO col_count;
        
        IF col_count = 0 THEN
          EXECUTE format('ALTER TABLE %I DROP COLUMN %I', table_name, col_name);
          RAISE NOTICE 'Eliminada columna vacía: %.%', table_name, col_name;
        ELSE
          RAISE NOTICE 'CONSERVADA: %.% tiene % valores (revisar manualmente)', 
                      table_name, col_name, col_count;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END$$;

-- ================================================================
-- FASE 5: OPTIMIZACIÓN
-- ================================================================
SELECT 'FASE 5: OPTIMIZANDO BASE DE DATOS' AS fase;

-- Recrear índices importantes si no existen
CREATE INDEX IF NOT EXISTS idx_service_tags_name ON service_tags(name);
CREATE INDEX IF NOT EXISTS idx_service_tags_active ON service_tags(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_service_tag_relations_tag_id ON service_tag_relations(tag_id);

-- Verificar constraints críticos
DO $$
BEGIN
  -- FK service_tags.company_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'service_tags'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'company_id'
  ) THEN
    ALTER TABLE service_tags ADD CONSTRAINT service_tags_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    RAISE NOTICE 'Recreado FK: service_tags.company_id';
  END IF;
  
  -- UNIQUE service_tags (name, company_id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'service_tags'
      AND tc.constraint_type = 'UNIQUE'
      AND tc.constraint_name LIKE '%name%company%'
  ) THEN
    ALTER TABLE service_tags ADD CONSTRAINT service_tags_name_company_unique 
    UNIQUE (name, company_id);
    RAISE NOTICE 'Recreado UNIQUE: service_tags(name, company_id)';
  END IF;
END$$;

-- VACUUM y ANALYZE
VACUUM ANALYZE service_tags;
VACUUM ANALYZE service_tag_relations;
VACUUM ANALYZE services;

-- ================================================================
-- RESUMEN FINAL
-- ================================================================
SELECT 'RESUMEN FINAL DE LIMPIEZA' AS status;

-- Estadísticas finales
CREATE TEMP TABLE cleanup_stats_final AS
SELECT 
  'service_tags' AS tabla,
  COUNT(*) AS registros,
  COUNT(*) FILTER (WHERE is_active = true) AS activos
FROM service_tags
UNION ALL
SELECT 
  'service_tag_relations' AS tabla,
  COUNT(*) AS registros,
  NULL AS activos
FROM service_tag_relations;

-- Comparación antes/después
SELECT 
  i.tabla,
  i.registros AS registros_inicial,
  f.registros AS registros_final,
  i.registros - f.registros AS eliminados,
  CASE 
    WHEN i.registros > 0 THEN 
      ROUND(((i.registros - f.registros)::DECIMAL / i.registros * 100), 2)
    ELSE 0 
  END AS porcentaje_reduccion
FROM cleanup_stats_initial i
JOIN cleanup_stats_final f ON i.tabla = f.tabla;

-- Verificación de integridad final
SELECT 'VERIFICACIÓN FINAL' AS status;

SELECT 
  'Tags huérfanos restantes: ' || COUNT(*) AS verificacion
FROM service_tags st
WHERE NOT EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = st.company_id AND c.deleted_at IS NULL
);

SELECT 
  'Relaciones huérfanas restantes: ' || COUNT(*) AS verificacion
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM services s WHERE s.id = str.service_id AND s.deleted_at IS NULL
)
OR NOT EXISTS (
  SELECT 1 FROM service_tags st WHERE st.id = str.tag_id AND st.is_active = true
);

-- Si todo está bien, confirmar
-- Si hay problemas, hacer ROLLBACK;
SELECT 'LIMPIEZA COMPLETADA - Revisar resultados y hacer COMMIT si todo está correcto' AS final_status;

-- COMMIT; -- Descomentar para confirmar cambios
