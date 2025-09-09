-- 30-detect-cleanup-candidates.sql
-- Detecta elementos candidatos para limpieza en la base de datos
-- tras las migraciones de service_tags y otros cambios recientes.
-- Solo DETECTA, no elimina nada. Ejecutar y revisar resultados.

-- ================================================================
-- 1. COLUMNAS TEMPORALES/OBSOLETAS
-- ================================================================
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    column_name LIKE '%_old' 
    OR column_name LIKE '%_new' 
    OR column_name LIKE '%_temp' 
    OR column_name LIKE '%_backup'
    OR column_name LIKE '%_final'
  )
ORDER BY table_name, column_name;

-- ================================================================
-- 2. ÍNDICES PROBLEMÁTICOS
-- ================================================================
-- Índices que referencian columnas que ya no existen o son obsoletas
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
  AND (
    indexdef LIKE '%_old%' 
    OR indexdef LIKE '%_new%' 
    OR indexdef LIKE '%_temp%'
    OR indexdef LIKE '%_backup%'
    OR indexdef LIKE '%_final%'
  )
ORDER BY tablename, indexname;

-- ================================================================
-- 3. CONSTRAINTS HUÉRFANOS O PROBLEMÁTICOS
-- ================================================================
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(pgc.oid) AS constraint_definition
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
ORDER BY tc.table_name, tc.constraint_name;

-- ================================================================
-- 4. DATOS HUÉRFANOS EN RELACIONES
-- ================================================================

-- Service tags huérfanos (sin company válida)
SELECT 'service_tags sin company válida' AS issue_type, COUNT(*) AS count
FROM service_tags st
WHERE NOT EXISTS (
  SELECT 1 FROM companies c 
  WHERE c.id = st.company_id 
  AND c.deleted_at IS NULL
);

-- Service tag relations huérfanas
SELECT 'service_tag_relations huérfanas' AS issue_type, COUNT(*) AS count
FROM service_tag_relations str
WHERE NOT EXISTS (
  SELECT 1 FROM services s 
  WHERE s.id = str.service_id 
  AND s.deleted_at IS NULL
)
OR NOT EXISTS (
  SELECT 1 FROM service_tags st 
  WHERE st.id = str.tag_id 
  AND st.is_active = true
);

-- Ticket tag relations huérfanas
SELECT 'ticket_tag_relations huérfanas' AS issue_type, COUNT(*) AS count
FROM ticket_tag_relations ttr
WHERE NOT EXISTS (
  SELECT 1 FROM tickets t 
  WHERE t.id = ttr.ticket_id 
  AND t.deleted_at IS NULL
)
OR NOT EXISTS (
  SELECT 1 FROM service_tags st 
  WHERE st.id = ttr.tag_id 
  AND st.is_active = true
);

-- ================================================================
-- 5. DUPLICADOS Y INCONSISTENCIAS
-- ================================================================

-- Service tags duplicados por (name, company_id)
SELECT 
  name, 
  company_id::text AS company_id_text, 
  COUNT(*) AS duplicate_count,
  string_agg(id::text, ', ') AS duplicate_ids
FROM service_tags
GROUP BY name, company_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- ================================================================
-- 6. ESTADÍSTICAS GENERALES
-- ================================================================
SELECT 
  'service_tags' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE is_active = true) AS active_rows,
  COUNT(*) FILTER (WHERE is_active = false) AS inactive_rows
FROM service_tags
UNION ALL
SELECT 
  'service_tag_relations' AS table_name,
  COUNT(*) AS total_rows,
  NULL AS active_rows,
  NULL AS inactive_rows
FROM service_tag_relations
UNION ALL
SELECT 
  'ticket_tag_relations' AS table_name,
  COUNT(*) AS total_rows,
  NULL AS active_rows,
  NULL AS inactive_rows
FROM ticket_tag_relations;

-- ================================================================
-- 7. FUNCIONES Y TRIGGERS OBSOLETOS
-- ================================================================
SELECT 
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND (
    p.proname LIKE '%_old%' 
    OR p.proname LIKE '%_temp%' 
    OR p.proname LIKE '%_backup%'
    OR pg_get_functiondef(p.oid) LIKE '%_old%'
  );

-- Triggers que referencian funciones/columnas obsoletas
SELECT 
  t.tgname,
  c.relname AS table_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND (
    pg_get_triggerdef(t.oid) LIKE '%_old%'
    OR pg_get_triggerdef(t.oid) LIKE '%_temp%'
    OR pg_get_triggerdef(t.oid) LIKE '%_backup%'
  );

-- ================================================================
-- INSTRUCCIONES DE USO:
-- ================================================================
-- 1. Ejecutar este script y revisar todas las secciones
-- 2. Para cada elemento detectado, decidir si eliminarlo o mantenerlo
-- 3. Usar los scripts de limpieza específicos (31, 32, 33) según necesidad
-- 4. Hacer backup antes de cualquier eliminación
-- ================================================================
