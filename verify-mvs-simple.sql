-- ============================================================
-- VERIFICACIÓN SIMPLE - MVs con datos de tu company
-- ============================================================

-- 1. Facturas
SELECT 'FACTURAS' as seccion,
       company_id, created_by, period_month,
       invoices_count, subtotal_sum, tax_sum, total_sum
FROM analytics.mv_invoice_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
ORDER BY period_month DESC;

-- 2. Tickets
SELECT 'TICKETS' as seccion,
       company_id, period_month,
       tickets_created, completed_count
FROM analytics.mv_ticket_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
ORDER BY period_month DESC;

-- 3. Presupuestos
SELECT 'PRESUPUESTOS' as seccion,
       company_id, created_by, period_month,
       quotes_count, subtotal_sum, tax_sum, total_sum
FROM analytics.mv_quote_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
ORDER BY period_month DESC;
