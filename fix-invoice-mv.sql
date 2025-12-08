-- ============================================================
-- Script de SOLUCIÓN para vistas materializadas vacías
-- ============================================================
-- Basado en tu configuración específica:
-- company_id: cd830f43-f6f0-4b78-a2a4-505e4e0976b5
-- created_by: 4462453f-7d05-4e76-88e4-968cd82a1127

-- PASO 1: Verificar que invoice_base tiene datos
SELECT 
  'PASO 1: Verificar invoice_base' as paso,
  COUNT(*) as total_filas
FROM analytics.invoice_base;

-- PASO 2: Ver la agrupación que debería aparecer en la MV
SELECT 
  'PASO 2: Agrupación esperada' as paso,
  company_id,
  created_by,
  period_month,
  COUNT(*) as facturas_count,
  SUM(total_amount) as total_sum
FROM analytics.invoice_base
GROUP BY company_id, created_by, period_month
ORDER BY period_month DESC;

-- PASO 3: Verificar estado actual de la MV
SELECT 
  'PASO 3: Estado MV antes' as paso,
  ispopulated as esta_poblada,
  COUNT(*) as filas_en_mv
FROM pg_matviews
CROSS JOIN analytics.mv_invoice_kpis_monthly
WHERE schemaname = 'analytics' 
  AND matviewname = 'mv_invoice_kpis_monthly'
GROUP BY ispopulated;

-- PASO 4: REFRESCAR la vista materializada
REFRESH MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly;

-- PASO 5: Verificar estado después del refresh
SELECT 
  'PASO 5: Estado MV después' as paso,
  ispopulated as esta_poblada,
  pg_size_pretty(pg_total_relation_size('analytics.mv_invoice_kpis_monthly')) as tamaño
FROM pg_matviews
WHERE schemaname = 'analytics' 
  AND matviewname = 'mv_invoice_kpis_monthly';

-- PASO 6: Contar filas en la MV después del refresh
SELECT 
  'PASO 6: Filas en MV' as paso,
  COUNT(*) as total_filas
FROM analytics.mv_invoice_kpis_monthly;

-- PASO 7: Ver contenido de la MV
SELECT 
  'PASO 7: Contenido MV' as paso,
  company_id,
  created_by,
  period_month,
  invoices_count,
  subtotal_sum,
  tax_sum,
  total_sum,
  paid_count,
  pending_count,
  overdue_count
FROM analytics.mv_invoice_kpis_monthly
ORDER BY period_month DESC;

-- PASO 8: Probar la función RPC (requiere estar autenticado)
-- Nota: Esta query fallará si no tienes el Auth Hook configurado
-- o si no has hecho logout/login después de configurarlo
SELECT 
  'PASO 8: Test función RPC' as paso,
  *
FROM public.f_invoice_kpis_monthly('2025-12-01', '2025-12-31');

-- Si el PASO 8 falla, aquí está la query directa sin autenticación:
SELECT 
  'PASO 8b: Query directa (sin auth)' as paso,
  m.company_id,
  m.created_by,
  m.period_month,
  m.invoices_count,
  m.subtotal_sum,
  m.tax_sum,
  m.total_sum
FROM analytics.mv_invoice_kpis_monthly m
WHERE m.company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
  AND m.created_by = '4462453f-7d05-4e76-88e4-968cd82a1127'
  AND m.period_month >= '2025-12-01'
  AND m.period_month <= '2025-12-31'
ORDER BY m.period_month DESC;
