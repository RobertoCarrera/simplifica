-- ============================================================
-- TEST: Verificar sistema de facturación recurrente
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase después del deploy
-- ============================================================

-- 1. Ver presupuestos recurrentes que deberían procesarse
SELECT 
  q.id,
  q.quote_number,
  q.title,
  q.total_amount,
  q.recurrence_type,
  q.next_run_at,
  q.last_run_at,
  q.status,
  c.name AS client_name
FROM quotes q
LEFT JOIN clients c ON c.id = q.client_id
WHERE q.recurrence_type IS NOT NULL
  AND q.recurrence_type != 'proyecto'
  AND q.status IN ('accepted', 'active')
  AND q.next_run_at IS NOT NULL
  AND q.next_run_at <= NOW()
ORDER BY q.next_run_at;

-- 2. Ver presupuestos recurrentes pendientes para el futuro
SELECT 
  q.id,
  q.quote_number,
  q.title,
  q.total_amount,
  q.recurrence_type,
  q.next_run_at,
  q.last_run_at,
  q.status
FROM quotes q
WHERE q.recurrence_type IS NOT NULL
  AND q.recurrence_type != 'proyecto'
ORDER BY q.next_run_at;

-- 3. Ver facturas generadas desde presupuestos recurrentes
SELECT 
  i.id,
  i.invoice_number,
  i.invoice_series,
  i.total,
  i.status,
  i.is_recurring,
  i.recurrence_period,
  i.source_quote_id,
  i.created_at
FROM invoices i
WHERE i.source_quote_id IS NOT NULL
   OR i.is_recurring = true
ORDER BY i.created_at DESC;

-- 4. Verificar que no hay duplicados
SELECT 
  source_quote_id,
  recurrence_period,
  COUNT(*) as count
FROM invoices
WHERE source_quote_id IS NOT NULL
GROUP BY source_quote_id, recurrence_period
HAVING COUNT(*) > 1;

-- 5. Ver el historial de un presupuesto recurrente específico
-- Cambiar el UUID por el presupuesto que quieras ver
/*
SELECT 
  i.*
FROM invoices i
WHERE i.source_quote_id = 'UUID_DEL_PRESUPUESTO'
ORDER BY i.recurrence_period;
*/

-- 6. Para probar manualmente: Poner next_run_at en el pasado
-- CUIDADO: Solo para pruebas!
/*
UPDATE quotes 
SET next_run_at = NOW() - INTERVAL '1 hour'
WHERE id = 'UUID_DEL_PRESUPUESTO';
*/

-- 7. Ver totales de KPIs que incluirán las facturas recurrentes
SELECT * FROM f_invoice_kpis_monthly(
  'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'::uuid,
  EXTRACT(YEAR FROM CURRENT_DATE)::integer,
  EXTRACT(MONTH FROM CURRENT_DATE)::integer
);

-- 8. Verificar estructura de columnas en invoices
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'invoices'
  AND column_name IN ('source_quote_id', 'recurrence_period', 'is_recurring')
ORDER BY column_name;
