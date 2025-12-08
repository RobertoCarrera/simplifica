-- ============================================================
-- Script de emergencia para poblar vistas materializadas
-- ============================================================
-- Ejecutar en Supabase SQL Editor cuando las vistas den error
-- "has not been populated"
-- ============================================================

-- Poblar ambas vistas materializadas
REFRESH MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly;
REFRESH MATERIALIZED VIEW analytics.mv_ticket_kpis_monthly;

-- Verificar que se poblaron correctamente
SELECT 
  'mv_invoice_kpis_monthly' as vista,
  COUNT(*) as filas,
  MAX(period_month) as ultimo_periodo
FROM analytics.mv_invoice_kpis_monthly

UNION ALL

SELECT 
  'mv_ticket_kpis_monthly' as vista,
  COUNT(*) as filas,
  MAX(period_month) as ultimo_periodo
FROM analytics.mv_ticket_kpis_monthly;
