-- ============================================================
-- Script de diagnóstico para facturas
-- ============================================================
-- Este script verifica el estado de las facturas y las vistas materializadas

-- 1. Verificar si existen facturas en la tabla
SELECT 
  'Total facturas' as verificacion,
  COUNT(*) as cantidad
FROM public.invoices
WHERE deleted_at IS NULL;

-- 2. Verificar facturas por origen
SELECT 
  'Facturas por origen' as verificacion,
  CASE 
    WHEN source_quote_id IS NULL THEN 'Manuales'
    ELSE 'Desde presupuesto'
  END as origen,
  COUNT(*) as cantidad
FROM public.invoices
WHERE deleted_at IS NULL
GROUP BY source_quote_id IS NULL;

-- 3. Verificar facturas por estado
SELECT 
  'Facturas por estado' as verificacion,
  status,
  COUNT(*) as cantidad
FROM public.invoices
WHERE deleted_at IS NULL
GROUP BY status;

-- 4. Verificar facturas con invoice_month
SELECT 
  'Facturas con invoice_month' as verificacion,
  COUNT(*) FILTER (WHERE invoice_month IS NOT NULL) as con_mes,
  COUNT(*) FILTER (WHERE invoice_month IS NULL) as sin_mes,
  COUNT(*) as total
FROM public.invoices
WHERE deleted_at IS NULL;

-- 5. Verificar facturas por mes
SELECT 
  'Facturas por mes' as verificacion,
  invoice_month,
  COUNT(*) as cantidad,
  SUM(total) as total_facturado
FROM public.invoices
WHERE deleted_at IS NULL
  AND invoice_month IS NOT NULL
GROUP BY invoice_month
ORDER BY invoice_month DESC
LIMIT 12;

-- 6. Verificar si existe la vista invoice_base
SELECT 
  'Vista invoice_base existe' as verificacion,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'analytics' 
    AND table_name = 'invoice_base'
  ) THEN 'SI' ELSE 'NO' END as resultado;

-- 7. Verificar contenido de invoice_base (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'analytics' 
    AND table_name = 'invoice_base'
  ) THEN
    RAISE NOTICE 'Contenido de analytics.invoice_base:';
    PERFORM COUNT(*) FROM analytics.invoice_base;
  ELSE
    RAISE NOTICE 'La vista analytics.invoice_base NO existe';
  END IF;
END $$;

SELECT 
  'Filas en invoice_base' as verificacion,
  COUNT(*) as cantidad
FROM analytics.invoice_base;

-- 8. Verificar estado de las vistas materializadas
SELECT 
  'Estado MVs' as verificacion,
  matviewname as vista,
  ispopulated as poblada,
  pg_size_pretty(pg_total_relation_size('analytics.'||matviewname)) as tamaño
FROM pg_matviews
WHERE schemaname = 'analytics'
  AND matviewname LIKE '%invoice%'
ORDER BY matviewname;

-- 9. Verificar contenido de mv_invoice_kpis_monthly
SELECT 
  'Contenido MV' as verificacion,
  COUNT(*) as filas,
  MIN(period_month) as primer_mes,
  MAX(period_month) as ultimo_mes
FROM analytics.mv_invoice_kpis_monthly;

-- 10. Muestra de facturas recientes
SELECT 
  'Muestra de facturas' as info,
  id,
  full_invoice_number,
  invoice_date,
  invoice_month,
  status,
  total,
  CASE WHEN source_quote_id IS NULL THEN 'Manual' ELSE 'Desde presupuesto' END as origen
FROM public.invoices
WHERE deleted_at IS NULL
ORDER BY invoice_date DESC
LIMIT 5;
