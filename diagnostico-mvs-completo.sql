-- ============================================================
-- DIAGNÓSTICO COMPLETO: Ver qué datos hay en las MVs
-- ============================================================

-- 1. Facturas MV - ¿Qué datos hay?
SELECT 'MV Facturas' as source, * 
FROM analytics.mv_invoice_kpis_monthly
ORDER BY period_month DESC;

-- 2. Presupuestos MV - ¿Qué datos hay?
SELECT 'MV Presupuestos' as source, * 
FROM analytics.mv_quote_kpis_monthly
ORDER BY period_month DESC;

-- 3. Tickets MV - ¿Qué datos hay?
SELECT 'MV Tickets' as source, * 
FROM analytics.mv_ticket_kpis_monthly
ORDER BY period_month DESC;

-- 4. Ver presupuestos reales (para comparar)
SELECT 
  'Presupuestos Reales' as source,
  DATE_TRUNC('month', created_at)::date as mes,
  status,
  COUNT(*) as cantidad,
  SUM(total) as total
FROM quotes
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
GROUP BY DATE_TRUNC('month', created_at), status
ORDER BY mes DESC, status;

-- 5. Ver facturas reales (para comparar)
SELECT 
  'Facturas Reales' as source,
  DATE_TRUNC('month', issue_date)::date as mes,
  status,
  COUNT(*) as cantidad,
  SUM(total) as total
FROM invoices
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
GROUP BY DATE_TRUNC('month', issue_date), status
ORDER BY mes DESC, status;

-- 6. Ver tickets reales
SELECT 
  'Tickets Reales' as source,
  DATE_TRUNC('month', created_at)::date as mes,
  status,
  COUNT(*) as cantidad
FROM tickets
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
GROUP BY DATE_TRUNC('month', created_at), status
ORDER BY mes DESC, status;

-- 7. Verificar que las RPCs devuelven datos
SELECT 'RPC Facturas' as source, * FROM public.f_invoice_kpis_monthly('2025-11-01', '2025-12-31');
SELECT 'RPC Presupuestos' as source, * FROM public.f_quote_kpis_monthly('2025-11-01', '2025-12-31');
SELECT 'RPC Tickets' as source, * FROM public.f_ticket_kpis_monthly('2025-11-01', '2025-12-31');
