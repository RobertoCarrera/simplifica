-- ============================================================
-- Script SIMPLIFICADO - Sin autenticación
-- ============================================================

-- PASO 1: Verificar invoice_base
SELECT 'PASO 1: invoice_base' as paso, COUNT(*) as total_filas
FROM analytics.invoice_base;

-- PASO 2: Agrupación esperada
SELECT 'PASO 2: Agrupación' as paso, company_id, created_by, period_month,
       COUNT(*) as facturas, SUM(total_amount) as total
FROM analytics.invoice_base
GROUP BY company_id, created_by, period_month
ORDER BY period_month DESC;

-- PASO 3: Estado MV ANTES del refresh
SELECT 'PASO 3: MV antes' as paso, COUNT(*) as filas
FROM analytics.mv_invoice_kpis_monthly;

-- PASO 4: REFRESCAR
REFRESH MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly;

-- PASO 5: Estado MV DESPUÉS del refresh
SELECT 'PASO 5: MV después' as paso, COUNT(*) as filas
FROM analytics.mv_invoice_kpis_monthly;

-- PASO 6: Contenido de la MV
SELECT 'PASO 6: Contenido' as paso, 
       company_id, created_by, period_month,
       invoices_count, subtotal_sum, tax_sum, total_sum,
       paid_count, pending_count, overdue_count
FROM analytics.mv_invoice_kpis_monthly
ORDER BY period_month DESC;

-- PASO 7: Query directa (simulando lo que hace la función RPC)
SELECT 'PASO 7: Simulación RPC' as paso,
       m.company_id, m.created_by, m.period_month,
       m.invoices_count, m.subtotal_sum, m.tax_sum, m.total_sum
FROM analytics.mv_invoice_kpis_monthly m
WHERE m.company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
  AND m.created_by = '4462453f-7d05-4e76-88e4-968cd82a1127'
  AND m.period_month >= '2025-12-01'
ORDER BY m.period_month DESC;
