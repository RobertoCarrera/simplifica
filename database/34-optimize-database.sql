-- 34-optimize-database.sql
-- Optimización final: VACUUM, ANALYZE, estadísticas
-- Seguro de ejecutar, mejora rendimiento
-- NOTA: Ejecutar fuera de transacciones explícitas (sin BEGIN/COMMIT)

-- ================================================================
-- 1. VACUUM Y ANALYZE DE TABLAS MODIFICADAS
-- ================================================================

-- Recuperar espacio y actualizar estadísticas tras limpieza
VACUUM ANALYZE service_tags;
VACUUM ANALYZE service_tag_relations;
VACUUM ANALYZE services;
VACUUM ANALYZE tickets;

-- ticket_tag_relations si existe
\if :{?table_exists}
VACUUM ANALYZE ticket_tag_relations;
\endif

-- ================================================================
-- 2. ESTADÍSTICAS FINALES
-- ================================================================

SELECT 
  'ESTADÍSTICAS POST-LIMPIEZA' AS section,
  CURRENT_TIMESTAMP AS timestamp;

-- Conteos por tabla
SELECT 
  'service_tags' AS tabla,
  COUNT(*) AS total_registros,
  COUNT(*) FILTER (WHERE is_active = true) AS activos,
  COUNT(*) FILTER (WHERE is_active = false) AS inactivos,
  COUNT(DISTINCT company_id) AS companies_con_tags
FROM service_tags

UNION ALL

SELECT 
  'service_tag_relations' AS tabla,
  COUNT(*) AS total_registros,
  COUNT(DISTINCT service_id) AS servicios_con_tags,
  COUNT(DISTINCT tag_id) AS tags_utilizados,
  NULL AS companies_con_tags
FROM service_tag_relations

UNION ALL

SELECT 
  'services' AS tabla,
  COUNT(*) AS total_registros,
  COUNT(*) FILTER (WHERE is_active = true AND deleted_at IS NULL) AS activos,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS eliminados,
  COUNT(DISTINCT company_id) AS companies_con_servicios
FROM services;

-- Distribución de tags por company
SELECT 
  c.name AS company_name,
  COUNT(st.id) AS total_tags,
  COUNT(st.id) FILTER (WHERE st.is_active = true) AS tags_activos,
  COUNT(DISTINCT str.service_id) AS servicios_con_tags
FROM companies c
LEFT JOIN service_tags st ON c.id = st.company_id
LEFT JOIN service_tag_relations str ON st.id = str.tag_id
WHERE c.deleted_at IS NULL
GROUP BY c.id, c.name
ORDER BY total_tags DESC;

-- Tags más utilizados
SELECT 
  st.name AS tag_name,
  c.name AS company_name,
  COUNT(str.service_id) AS veces_usado,
  st.color,
  st.created_at
FROM service_tags st
JOIN companies c ON st.company_id = c.id
LEFT JOIN service_tag_relations str ON st.id = str.tag_id
WHERE st.is_active = true
GROUP BY st.id, st.name, c.name, st.color, st.created_at
HAVING COUNT(str.service_id) > 0
ORDER BY veces_usado DESC, st.name
LIMIT 20;

-- Servicios sin tags
SELECT 
  s.name AS service_name,
  c.name AS company_name,
  s.category,
  s.created_at
FROM services s
JOIN companies c ON s.company_id = c.id
WHERE s.deleted_at IS NULL 
  AND s.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM service_tag_relations str 
    WHERE str.service_id = s.id
  )
ORDER BY c.name, s.name
LIMIT 10;

-- ================================================================
-- 3. VERIFICACIONES DE INTEGRIDAD
-- ================================================================

-- Verificar que no hay FKs rotas
SELECT 'VERIFICACIÓN DE INTEGRIDAD' AS section;

-- service_tags -> companies
SELECT 
  'service_tags -> companies' AS relacion,
  COUNT(*) AS registros_huerfanos
FROM service_tags st
WHERE NOT EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = st.company_id AND c.deleted_at IS NULL
);

-- service_tag_relations -> services
SELECT 
  'service_tag_relations -> services' AS relacion,
  COUNT(*) AS registros_huerfanos
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM services s 
  WHERE s.id = str.service_id AND s.deleted_at IS NULL
);

-- service_tag_relations -> service_tags
SELECT 
  'service_tag_relations -> service_tags' AS relacion,
  COUNT(*) AS registros_huerfanos
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM service_tags st 
  WHERE st.id = str.tag_id AND st.is_active = true
);

-- ================================================================
-- 4. RECOMENDACIONES
-- ================================================================

SELECT 'RECOMENDACIONES' AS section;

-- Tags duplicados pendientes (si los hay)
WITH duplicates AS (
  SELECT name, company_id, COUNT(*) as count
  FROM service_tags
  GROUP BY name, company_id
  HAVING COUNT(*) > 1
)
SELECT 
  'Tags duplicados encontrados: ' || COUNT(*) AS recomendacion
FROM duplicates;

-- Tags inactivos antiguos
WITH old_inactive AS (
  SELECT COUNT(*) as count
  FROM service_tags
  WHERE is_active = false 
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '6 months'
    AND NOT EXISTS (
      SELECT 1 FROM service_tag_relations str 
      WHERE str.tag_id = service_tags.id
    )
)
SELECT 
  'Tags inactivos sin uso de hace >6 meses: ' || count AS recomendacion
FROM old_inactive;

-- Estadísticas de espacio
SELECT 
  pg_size_pretty(pg_total_relation_size('service_tags')) AS "Tamaño service_tags",
  pg_size_pretty(pg_total_relation_size('service_tag_relations')) AS "Tamaño service_tag_relations",
  pg_size_pretty(pg_total_relation_size('services')) AS "Tamaño services";

DO $$
BEGIN
  RAISE NOTICE '=== OPTIMIZACIÓN COMPLETADA ===';
  RAISE NOTICE 'Base de datos optimizada y estadísticas actualizadas';
  RAISE NOTICE 'Revisar las recomendaciones para mejoras adicionales';
END$$;
