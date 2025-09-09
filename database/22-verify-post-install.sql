-- Verificación post-instalación para sistema de tags de servicios
-- Ejecutar después de aplicar `00-master-tags-implementation.sql`

-- 1. Existencia de tablas
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('service_tags','service_tag_relations','ticket_tag_relations','ticket_services')
ORDER BY table_name;

-- 2. Verificar constraints y FK
SELECT conname, conrelid::regclass AS table_name, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid::regclass::text IN ('service_tags','service_tag_relations')
ORDER BY conrelid::regclass::text;

-- 3. Triggers asociados a ticket_services y service_tag_relations
SELECT tgname, tgrelid::regclass AS table_name, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid::regclass::text IN ('ticket_services','service_tag_relations')
ORDER BY tgrelid::regclass::text;

-- 4. Funciones relevantes
SELECT proname, pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE proname IN (
  'sync_ticket_tags_from_services_enhanced',
  'sync_ticket_tags_from_services',
  'sync_tickets_on_service_tag_change',
  'get_service_tags_by_company',
  'get_services_with_tags',
  'cleanup_orphaned_tags'
)
ORDER BY proname;

-- 5. Comprobaciones de muestra
-- a) contar tags por empresa
SELECT st.company_id, COUNT(*) AS tags_count
FROM service_tags st
GROUP BY st.company_id
ORDER BY tags_count DESC
LIMIT 10;

-- b) contar tickets que tienen tags
SELECT COUNT(DISTINCT ttr.ticket_id) FROM ticket_tag_relations ttr;

-- c) buscar relaciones huérfanas en service_tag_relations
SELECT COUNT(*) FROM service_tag_relations str
WHERE NOT EXISTS (SELECT 1 FROM service_tags st WHERE st.id = str.tag_id)
OR NOT EXISTS (SELECT 1 FROM services s WHERE s.id = str.service_id AND s.deleted_at IS NULL);

-- 6. Probar trigger manualmente (opcional)
-- Insertar un ticket_service de prueba y comprobar que ticket_tag_relations se actualiza.
-- Usar transacción y ROLLBACK en entorno de pruebas.

-- FIN
