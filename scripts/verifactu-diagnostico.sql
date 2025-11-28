-- ============================================
-- SCRIPT DE DIAGNÓSTICO VERIFACTU
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. CONFIGURACIÓN DE LA EMPRESA
-- ============================================
SELECT 
  '📋 CONFIGURACIÓN VERIFACTU' as seccion;

SELECT 
  c.name as empresa,
  vs.environment as entorno,
  vs.issuer_nif as nif_emisor,
  vs.software_code as codigo_software,
  CASE WHEN vs.cert_pem_enc IS NOT NULL THEN '✅ Certificado cargado' ELSE '❌ Sin certificado' END as certificado,
  CASE WHEN vs.key_pem_enc IS NOT NULL THEN '✅ Clave cargada' ELSE '❌ Sin clave' END as clave_privada,
  vs.updated_at as ultima_actualizacion
FROM verifactu_settings vs
JOIN companies c ON vs.company_id = c.id;

-- ============================================
-- 2. SERIES CON VERIFACTU HABILITADO
-- ============================================
SELECT 
  '📊 SERIES DE FACTURACIÓN' as seccion;

SELECT 
  s.year || '-' || s.series_code as serie,
  s.is_active as activa,
  s.is_default as por_defecto,
  s.verifactu_enabled as verifactu_habilitado,
  s.next_number - 1 as ultimo_numero
FROM invoice_series s
WHERE s.is_active = true
ORDER BY s.year DESC, s.series_code;

-- ============================================
-- 3. ÚLTIMOS EVENTOS VERIFACTU
-- ============================================
SELECT 
  '📨 ÚLTIMOS EVENTOS AEAT' as seccion;

SELECT 
  i.invoice_series || '-' || i.invoice_number as factura,
  e.event_type as tipo,
  e.status as estado,
  e.attempts as intentos,
  e.response->>'status' as respuesta_aeat,
  CASE WHEN e.response->>'simulation' = 'true' THEN '⚠️ SIMULACIÓN' ELSE '✅ REAL' END as modo,
  e.last_error as error,
  e.sent_at as enviado,
  e.created_at as creado
FROM verifactu.events e
LEFT JOIN invoices i ON e.invoice_id = i.id
ORDER BY e.created_at DESC
LIMIT 20;

-- ============================================
-- 4. RESUMEN POR ESTADO
-- ============================================
SELECT 
  '📈 RESUMEN POR ESTADO' as seccion;

SELECT 
  status as estado,
  event_type as tipo,
  COUNT(*) as total,
  MIN(created_at) as primer_evento,
  MAX(created_at) as ultimo_evento
FROM verifactu.events
GROUP BY status, event_type
ORDER BY MAX(created_at) DESC;

-- ============================================
-- 5. EVENTOS FALLIDOS (si los hay)
-- ============================================
SELECT 
  '❌ EVENTOS FALLIDOS' as seccion;

SELECT 
  i.invoice_series || '-' || i.invoice_number as factura,
  e.event_type as tipo,
  e.status as estado,
  e.attempts as intentos,
  e.last_error as error,
  e.response as respuesta_completa,
  e.created_at
FROM verifactu.events e
LEFT JOIN invoices i ON e.invoice_id = i.id
WHERE e.status IN ('error', 'failed', 'rejected')
ORDER BY e.created_at DESC
LIMIT 10;

-- ============================================
-- 6. EVENTOS PENDIENTES
-- ============================================
SELECT 
  '⏳ EVENTOS PENDIENTES' as seccion;

SELECT 
  i.invoice_series || '-' || i.invoice_number as factura,
  e.event_type as tipo,
  e.status as estado,
  e.attempts as intentos,
  e.created_at as creado,
  NOW() - e.created_at as tiempo_pendiente
FROM verifactu.events e
LEFT JOIN invoices i ON e.invoice_id = i.id
WHERE e.status IN ('pending', 'sending', 'queued')
ORDER BY e.created_at ASC;

-- ============================================
-- 7. FACTURAS RECIENTES Y SU ESTADO VERIFACTU
-- ============================================
SELECT 
  '🧾 FACTURAS RECIENTES' as seccion;

SELECT 
  i.invoice_series || '-' || i.invoice_number as factura,
  i.invoice_date as fecha,
  i.status as estado_factura,
  i.total,
  s.verifactu_enabled as serie_verifactu,
  COALESCE(e.status, 'sin_evento') as estado_verifactu,
  c.name as cliente
FROM invoices i
JOIN invoice_series s ON i.series_id = s.id
LEFT JOIN clients c ON i.client_id = c.id
LEFT JOIN verifactu.events e ON e.invoice_id = i.id AND e.event_type = 'alta'
WHERE i.invoice_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY i.created_at DESC
LIMIT 15;

-- ============================================
-- 8. VERIFICAR INTEGRIDAD DE CADENA
-- ============================================
SELECT 
  '🔗 INTEGRIDAD DE CADENA' as seccion;

SELECT 
  invoice_series || '-' || invoice_number as factura,
  verifactu_chain_position as posicion_cadena,
  LEFT(verifactu_hash, 20) || '...' as hash_truncado,
  verifactu_timestamp,
  verifactu_signature IS NOT NULL as tiene_firma,
  verifactu_qr_code IS NOT NULL as tiene_qr
FROM invoices
WHERE verifactu_chain_position IS NOT NULL
ORDER BY verifactu_chain_position DESC
LIMIT 10;

-- ============================================
-- 9. MÉTRICAS GLOBALES
-- ============================================
SELECT 
  '📊 MÉTRICAS GLOBALES' as seccion;

SELECT 
  (SELECT COUNT(*) FROM verifactu.events) as total_eventos,
  (SELECT COUNT(*) FROM verifactu.events WHERE status = 'accepted') as aceptados,
  (SELECT COUNT(*) FROM verifactu.events WHERE status IN ('error', 'failed', 'rejected')) as fallidos,
  (SELECT COUNT(*) FROM verifactu.events WHERE status IN ('pending', 'sending')) as pendientes,
  (SELECT COUNT(*) FROM verifactu.events WHERE response->>'simulation' = 'true') as simulaciones,
  (SELECT COUNT(*) FROM invoices i JOIN invoice_series s ON i.series_id = s.id WHERE s.verifactu_enabled = true AND i.invoice_date >= '2025-01-01') as facturas_verifactu_2025;
