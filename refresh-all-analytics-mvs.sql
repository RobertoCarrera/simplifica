-- ============================================================
-- Refrescar TODAS las vistas materializadas de analytics
-- ============================================================

-- Facturas
REFRESH MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly;

-- Tickets
REFRESH MATERIALIZED VIEW analytics.mv_ticket_kpis_monthly;

-- Presupuestos (si existen)
DO $$
BEGIN
  REFRESH MATERIALIZED VIEW analytics.mv_quote_kpis_monthly;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  REFRESH MATERIALIZED VIEW analytics.mv_quote_top_items_monthly;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  REFRESH MATERIALIZED VIEW analytics.mv_quote_cube;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Verificar resultados
SELECT 'Facturas' as vista, COUNT(*) as filas FROM analytics.mv_invoice_kpis_monthly
UNION ALL
SELECT 'Tickets' as vista, COUNT(*) as filas FROM analytics.mv_ticket_kpis_monthly;
