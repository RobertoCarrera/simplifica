-- 36-cleanup-fixed.sql
-- Script de limpieza corregido sin errores de sintaxis
-- Ejecuta limpieza básica de forma segura

-- ================================================================
-- PASO 1: DETECTAR QUÉ HAY QUE LIMPIAR
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '=== DETECCIÓN DE ELEMENTOS A LIMPIAR ===';
END$$;

-- Columnas temporales existentes
SELECT 
  'Columnas temporales detectadas:' AS tipo,
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    column_name LIKE '%_old' 
    OR column_name LIKE '%_new' 
    OR column_name LIKE '%_temp' 
    OR column_name LIKE '%_final'
  )
ORDER BY table_name, column_name;

-- Datos huérfanos en service_tag_relations
SELECT 
  'Relaciones huérfanas:' AS tipo,
  'service_tag_relations -> services inexistentes' AS detalle,
  COUNT(*) AS cantidad
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM services s 
  WHERE s.id = str.service_id 
  AND s.deleted_at IS NULL
)
UNION ALL
SELECT 
  'Relaciones huérfanas:' AS tipo,
  'service_tag_relations -> tags inexistentes' AS detalle,
  COUNT(*) AS cantidad
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM service_tags st 
  WHERE st.id = str.tag_id 
  AND st.is_active = true
);

-- Tags huérfanos
SELECT 
  'Tags huérfanos:' AS tipo,
  'service_tags -> companies inexistentes' AS detalle,
  COUNT(*) AS cantidad
FROM service_tags st
WHERE NOT EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = st.company_id 
  AND c.deleted_at IS NULL
);

-- Duplicados
SELECT 
  'Duplicados:' AS tipo,
  'service_tags duplicados por (name, company_id)' AS detalle,
  COUNT(*) AS cantidad
FROM (
  SELECT name, company_id
  FROM service_tags
  GROUP BY name, company_id
  HAVING COUNT(*) > 1
) duplicados;

-- ================================================================
-- PASO 2: LIMPIEZA DE DATOS HUÉRFANOS
-- ================================================================

DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  RAISE NOTICE '=== INICIANDO LIMPIEZA DE DATOS HUÉRFANOS ===';
  
  -- Eliminar relaciones que apuntan a servicios eliminados
  DELETE FROM service_tag_relations str
  WHERE NOT EXISTS (
    SELECT 1 FROM services s 
    WHERE s.id = str.service_id 
    AND s.deleted_at IS NULL
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Eliminadas % relaciones con servicios inexistentes', deleted_count;
  
  -- Eliminar relaciones que apuntan a tags inactivos
  DELETE FROM service_tag_relations str
  WHERE NOT EXISTS (
    SELECT 1 FROM service_tags st 
    WHERE st.id = str.tag_id 
    AND st.is_active = true
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Eliminadas % relaciones con tags inactivos', deleted_count;
  
  -- Eliminar tags que apuntan a companies inexistentes
  DELETE FROM service_tags st
  WHERE NOT EXISTS (
    SELECT 1 FROM companies c 
    WHERE c.id = st.company_id 
    AND c.deleted_at IS NULL
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Eliminados % tags con companies inexistentes', deleted_count;
  
END$$;

-- ================================================================
-- PASO 3: ELIMINAR DUPLICADOS
-- ================================================================

DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  RAISE NOTICE '=== ELIMINANDO DUPLICADOS ===';
  
  -- Primero eliminar relaciones a duplicados que vamos a borrar
  DELETE FROM service_tag_relations 
  WHERE tag_id IN (
    SELECT id FROM (
      SELECT 
        id,
        ROW_NUMBER() OVER (
          PARTITION BY name, company_id 
          ORDER BY created_at DESC, id DESC
        ) AS rn
      FROM service_tags
    ) ranked
    WHERE rn > 1
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Eliminadas % relaciones de tags duplicados', deleted_count;
  
  -- Luego eliminar los duplicados (mantener el más reciente)
  DELETE FROM service_tags 
  WHERE id IN (
    SELECT id FROM (
      SELECT 
        id,
        ROW_NUMBER() OVER (
          PARTITION BY name, company_id 
          ORDER BY created_at DESC, id DESC
        ) AS rn
      FROM service_tags
    ) ranked
    WHERE rn > 1
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Eliminados % tags duplicados', deleted_count;
  
END$$;

-- ================================================================
-- PASO 4: ELIMINAR COLUMNAS TEMPORALES VACÍAS
-- ================================================================

DO $$
DECLARE
  col_name TEXT;
  tab_name TEXT;
  col_count INTEGER;
  temp_columns TEXT[] := ARRAY['company_id_old', 'company_id_new', 'company_id_final'];
  tables_to_check TEXT[] := ARRAY['service_tags'];
BEGIN
  RAISE NOTICE '=== ELIMINANDO COLUMNAS TEMPORALES VACÍAS ===';
  
  FOREACH tab_name IN ARRAY tables_to_check
  LOOP
    FOREACH col_name IN ARRAY temp_columns
    LOOP
      -- Verificar si la columna existe
      SELECT COUNT(*) INTO col_count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND information_schema.columns.table_name = tab_name
        AND information_schema.columns.column_name = col_name;
      
      IF col_count > 0 THEN
        -- Verificar si está vacía
        EXECUTE format('SELECT COUNT(*) FROM %I WHERE %I IS NOT NULL', 
                      tab_name, col_name) INTO col_count;
        
        IF col_count = 0 THEN
          EXECUTE format('ALTER TABLE %I DROP COLUMN %I', tab_name, col_name);
          RAISE NOTICE 'Eliminada columna vacía: %.%', tab_name, col_name;
        ELSE
          RAISE NOTICE 'CONSERVADA: %.% tiene % valores no-null', 
                      tab_name, col_name, col_count;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END$$;

-- ================================================================
-- PASO 5: OPTIMIZACIÓN (SIN VACUUM DENTRO DE TRANSACCIÓN)
-- ================================================================

-- Recrear índices útiles si no existen
CREATE INDEX IF NOT EXISTS idx_service_tags_name ON service_tags(name);
CREATE INDEX IF NOT EXISTS idx_service_tags_active ON service_tags(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_service_tag_relations_tag_id ON service_tag_relations(tag_id);

DO $$
BEGIN
  RAISE NOTICE '=== ÍNDICES RECREADOS ===';
  RAISE NOTICE 'NOTA: Ejecutar VACUUM ANALYZE manualmente después de este script';
  RAISE NOTICE 'Comandos sugeridos:';
  RAISE NOTICE '  VACUUM ANALYZE service_tags;';
  RAISE NOTICE '  VACUUM ANALYZE service_tag_relations;';
  RAISE NOTICE '  VACUUM ANALYZE services;';
END$$;

-- ================================================================
-- VERIFICACIÓN FINAL
-- ================================================================

DO $$
BEGIN
  RAISE NOTICE '=== VERIFICACIÓN FINAL ===';
END$$;

-- Estadísticas finales
SELECT 
  'ESTADÍSTICAS FINALES' AS seccion,
  'service_tags' AS tabla,
  COUNT(*) AS total_registros,
  COUNT(*) FILTER (WHERE is_active = true) AS activos,
  COUNT(*) FILTER (WHERE is_active = false) AS inactivos
FROM service_tags
UNION ALL
SELECT 
  'ESTADÍSTICAS FINALES' AS seccion,
  'service_tag_relations' AS tabla,
  COUNT(*) AS total_registros,
  NULL AS activos,
  NULL AS inactivos
FROM service_tag_relations;

-- Verificar que no quedan huérfanos
SELECT 
  'VERIFICACIÓN INTEGRIDAD' AS seccion,
  'Tags huérfanos restantes' AS tipo,
  COUNT(*) AS cantidad
FROM service_tags st
WHERE NOT EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = st.company_id AND c.deleted_at IS NULL
)
UNION ALL
SELECT 
  'VERIFICACIÓN INTEGRIDAD' AS seccion,
  'Relaciones huérfanas restantes' AS tipo,
  COUNT(*) AS cantidad
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM services s WHERE s.id = str.service_id AND s.deleted_at IS NULL
)
OR NOT EXISTS (
  SELECT 1 FROM service_tags st WHERE st.id = str.tag_id AND st.is_active = true
);

-- Columnas temporales restantes
SELECT 
  'COLUMNAS TEMPORALES RESTANTES' AS seccion,
  table_name,
  column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    column_name LIKE '%_old' 
    OR column_name LIKE '%_new' 
    OR column_name LIKE '%_temp' 
    OR column_name LIKE '%_final'
  )
ORDER BY table_name, column_name;

DO $$
BEGIN
  RAISE NOTICE '=== LIMPIEZA COMPLETADA ===';
  RAISE NOTICE 'Revisar las estadísticas finales arriba';
  RAISE NOTICE 'Si hay 0 huérfanos y 0 columnas temporales, la limpieza fue exitosa';
END$$;
