-- ============================================================
-- VERIFICACIÓN DIRECTA DE MVs (sin RPC, sin autenticación)
-- ============================================================
-- Este script NO requiere JWT y se puede ejecutar desde SQL Editor

-- 1. Estado de las MVs
SELECT 'Estado MVs' as info,
       schemaname, matviewname, ispopulated,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as tamaño
FROM pg_matviews
WHERE schemaname = 'analytics'
ORDER BY matviewname;

-- 2. Contenido de mv_invoice_kpis_monthly
SELECT 'Facturas MV' as tipo,
       company_id, created_by, period_month,
       invoices_count, subtotal_sum, tax_sum, total_sum,
       paid_count, pending_count, overdue_count
FROM analytics.mv_invoice_kpis_monthly
ORDER BY period_month DESC
LIMIT 5;

-- 3. Contenido de mv_ticket_kpis_monthly  
SELECT 'Tickets MV' as tipo,
       company_id, period_month,
       tickets_created, open_count, in_progress_count, completed_count,
       critical_count, overdue_count
FROM analytics.mv_ticket_kpis_monthly
ORDER BY period_month DESC
LIMIT 5;

-- 4. Contenido de mv_quote_kpis_monthly
SELECT 'Presupuestos MV' as tipo,
       company_id, created_by, period_month,
       quotes_count, subtotal_sum, tax_sum, total_sum,
       draft_count, sent_count, accepted_count
FROM analytics.mv_quote_kpis_monthly
ORDER BY period_month DESC
LIMIT 5;

-- 5. Resumen total por tipo
SELECT 'Resumen' as info,
       'Facturas' as tipo,
       COUNT(*) as filas_mv,
       SUM(invoices_count) as total_registros,
       SUM(total_sum) as suma_total
FROM analytics.mv_invoice_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'

UNION ALL

SELECT 'Resumen', 'Tickets',
       COUNT(*), SUM(tickets_created), NULL
FROM analytics.mv_ticket_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'

UNION ALL

SELECT 'Resumen', 'Presupuestos',
       COUNT(*), SUM(quotes_count), SUM(total_sum)
FROM analytics.mv_quote_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';
