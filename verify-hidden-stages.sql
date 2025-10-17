-- =====================================================
-- Verificación del Sistema de Estados Ocultos
-- =====================================================
-- Ejecuta estas queries para verificar que el sistema
-- funciona correctamente
-- =====================================================

-- 1. Ver todos los registros en hidden_stages
SELECT 
  hs.id,
  c.name as company_name,
  ts.name as stage_name,
  u.email as hidden_by_user,
  hs.hidden_at,
  hs.stage_id,
  hs.company_id
FROM hidden_stages hs
JOIN companies c ON c.id = hs.company_id
JOIN ticket_stages ts ON ts.id = hs.stage_id
LEFT JOIN users u ON u.id = hs.hidden_by
ORDER BY hs.hidden_at DESC;

-- 2. Ver estados genéricos y cuántas empresas los han ocultado
SELECT 
  ts.id,
  ts.name as stage_name,
  ts.position,
  ts.color,
  COUNT(hs.id) as hidden_count,
  ARRAY_AGG(c.name) FILTER (WHERE c.name IS NOT NULL) as companies_hidden
FROM ticket_stages ts
LEFT JOIN hidden_stages hs ON hs.stage_id = ts.id
LEFT JOIN companies c ON c.id = hs.company_id
WHERE ts.company_id IS NULL
GROUP BY ts.id, ts.name, ts.position, ts.color
ORDER BY ts.position;

-- 3. Ver estados ocultos para una empresa específica
-- (Reemplaza 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5' con el company_id que quieras verificar)
SELECT 
  ts.id,
  ts.name as stage_name,
  hs.hidden_at,
  u.email as hidden_by
FROM ticket_stages ts
JOIN hidden_stages hs ON hs.stage_id = ts.id
LEFT JOIN users u ON u.id = hs.hidden_by
WHERE hs.company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
ORDER BY hs.hidden_at DESC;

-- 4. Contar registros totales
SELECT 
  'Total hidden_stages' as metric,
  COUNT(*) as count
FROM hidden_stages
UNION ALL
SELECT 
  'Generic stages' as metric,
  COUNT(*) as count
FROM ticket_stages
WHERE company_id IS NULL
UNION ALL
SELECT 
  'Companies' as metric,
  COUNT(*) as count
FROM companies;

-- =====================================================
-- QUERIES DE DEBUGGING
-- =====================================================

-- Si ves que is_hidden siempre es FALSE, ejecuta esto:
-- 1. Primero inserta manualmente un registro para probar
/*
INSERT INTO hidden_stages (company_id, stage_id, hidden_by)
VALUES (
  'cd830f43-f6f0-4b78-a2a4-505e4e0976b5', -- Tu company_id
  'bfeef192-7fab-41f2-b5f9-4f4c9a83fd22', -- ID del estado "Recibido"
  (SELECT id FROM users WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5' LIMIT 1)
);
*/

-- 2. Luego verifica que el servicio Angular lo detecta:
SELECT 
  ts.id,
  ts.name,
  ts.company_id,
  CASE WHEN hs.id IS NOT NULL THEN true ELSE false END as is_hidden
FROM ticket_stages ts
LEFT JOIN hidden_stages hs ON (
  hs.stage_id = ts.id 
  AND hs.company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
)
WHERE ts.company_id IS NULL
ORDER BY ts.position;
