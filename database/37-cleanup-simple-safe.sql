-- 37-cleanup-simple-safe.sql
-- Script de limpieza ultra-simple sin errores de sintaxis
-- Ejecuta solo las operaciones más básicas y seguras

-- ================================================================
-- DETECCIÓN BÁSICA
-- ================================================================

-- Ver columnas temporales
SELECT 
  table_name,
  column_name,
  'Columna temporal detectada' AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name LIKE '%_old' OR column_name LIKE '%_new' OR column_name LIKE '%_temp' OR column_name LIKE '%_final')
ORDER BY table_name, column_name;

-- Ver datos huérfanos
SELECT 
  'service_tag_relations -> services inexistentes' AS problema,
  COUNT(*) AS cantidad
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM services s 
  WHERE s.id = str.service_id AND s.deleted_at IS NULL
);

SELECT 
  'service_tag_relations -> tags inexistentes' AS problema,
  COUNT(*) AS cantidad
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM service_tags st 
  WHERE st.id = str.tag_id AND st.is_active = true
);

SELECT 
  'service_tags -> companies inexistentes' AS problema,
  COUNT(*) AS cantidad
FROM service_tags st
WHERE NOT EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = st.company_id AND c.deleted_at IS NULL
);

-- ================================================================
-- LIMPIEZA PASO A PASO
-- ================================================================

-- PASO 1: Eliminar relaciones huérfanas (servicios)
DELETE FROM service_tag_relations 
WHERE service_id NOT IN (
  SELECT id FROM services WHERE deleted_at IS NULL
);

-- PASO 2: Eliminar relaciones huérfanas (tags)
DELETE FROM service_tag_relations 
WHERE tag_id NOT IN (
  SELECT id FROM service_tags WHERE is_active = true
);

-- PASO 3: Eliminar tags huérfanos
DELETE FROM service_tags 
WHERE company_id NOT IN (
  SELECT id FROM companies WHERE deleted_at IS NULL
);

-- PASO 4: Eliminar duplicados de service_tags
-- Usar CTE para identificar duplicados y eliminar los más antiguos
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY name, company_id 
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM service_tags
),
duplicates_to_delete AS (
  SELECT id FROM duplicates WHERE rn > 1
)
DELETE FROM service_tag_relations 
WHERE tag_id IN (SELECT id FROM duplicates_to_delete);

-- Ahora eliminar los tags duplicados
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

-- ================================================================
-- VERIFICACIÓN POST-LIMPIEZA
-- ================================================================

-- Estadísticas finales
SELECT 'ESTADÍSTICAS FINALES' AS seccion;

SELECT 
  'service_tags' AS tabla,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE is_active = true) AS activos,
  COUNT(*) FILTER (WHERE is_active = false) AS inactivos
FROM service_tags;

SELECT 
  'service_tag_relations' AS tabla,
  COUNT(*) AS total,
  COUNT(DISTINCT service_id) AS servicios_distintos,
  COUNT(DISTINCT tag_id) AS tags_distintos
FROM service_tag_relations;

-- Verificar que no quedan huérfanos
SELECT 'VERIFICACIÓN INTEGRIDAD' AS seccion;

SELECT 
  'Tags huérfanos restantes' AS tipo,
  COUNT(*) AS cantidad
FROM service_tags st
WHERE NOT EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = st.company_id AND c.deleted_at IS NULL
);

SELECT 
  'Relaciones huérfanas (servicios) restantes' AS tipo,
  COUNT(*) AS cantidad
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM services s 
  WHERE s.id = str.service_id AND s.deleted_at IS NULL
);

SELECT 
  'Relaciones huérfanas (tags) restantes' AS tipo,
  COUNT(*) AS cantidad
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM service_tags st 
  WHERE st.id = str.tag_id AND st.is_active = true
);

-- Columnas temporales restantes
SELECT 'COLUMNAS TEMPORALES RESTANTES' AS seccion;

SELECT 
  table_name,
  column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name LIKE '%_old' OR column_name LIKE '%_new' OR column_name LIKE '%_temp' OR column_name LIKE '%_final')
ORDER BY table_name, column_name;

-- ================================================================
-- COMANDOS MANUALES SUGERIDOS
-- ================================================================

SELECT 'COMANDOS PARA EJECUTAR MANUALMENTE DESPUÉS:' AS instrucciones;
SELECT 'VACUUM ANALYZE service_tags;' AS comando;
SELECT 'VACUUM ANALYZE service_tag_relations;' AS comando;
SELECT 'VACUUM ANALYZE services;' AS comando;

-- Para eliminar columnas temporales vacías (SOLO SI ESTÁN VACÍAS):
-- SELECT 'Para eliminar columnas temporales, verificar primero que estén vacías y ejecutar:' AS instrucciones;
-- SELECT 'ALTER TABLE service_tags DROP COLUMN company_id_old;' AS comando_opcional;
-- SELECT 'ALTER TABLE service_tags DROP COLUMN company_id_new;' AS comando_opcional;
