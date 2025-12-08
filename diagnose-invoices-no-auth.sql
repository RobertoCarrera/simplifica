-- ============================================================
-- Script de diagnóstico SIN AUTENTICACIÓN
-- ============================================================
-- Este script NO usa funciones que requieren JWT

-- 1. Verificar facturas y su created_by
SELECT 
  'Facturas con created_by' as verificacion,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE created_by IS NOT NULL) as con_created_by,
  COUNT(*) FILTER (WHERE created_by IS NULL) as sin_created_by
FROM public.invoices
WHERE deleted_at IS NULL;

-- 2. Verificar company_id de las facturas
SELECT 
  'Company IDs en facturas' as verificacion,
  company_id,
  COUNT(*) as cantidad
FROM public.invoices
WHERE deleted_at IS NULL
GROUP BY company_id;

-- 3. Verificar created_by de las facturas
SELECT 
  'Created By en facturas' as verificacion,
  created_by,
  COUNT(*) as cantidad
FROM public.invoices
WHERE deleted_at IS NULL
GROUP BY created_by
LIMIT 5;

-- 4. Verificar si existe el schema analytics
SELECT 
  'Schema analytics existe' as verificacion,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'analytics'
  ) THEN 'SI' ELSE 'NO' END as resultado;

-- 5. Verificar si existe la vista invoice_base
SELECT 
  'Vista invoice_base existe' as verificacion,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'analytics' AND table_name = 'invoice_base'
  ) THEN 'SI' ELSE 'NO' END as resultado;

-- 6. Contar filas en invoice_base (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'analytics' AND table_name = 'invoice_base'
  ) THEN
    RAISE NOTICE 'La vista invoice_base existe';
  ELSE
    RAISE NOTICE 'La vista invoice_base NO existe - necesitas ejecutar analytics-invoices-datamart.sql';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error al verificar invoice_base: %', SQLERRM;
END $$;

-- 7. Intentar contar filas en invoice_base
SELECT 
  'Filas en invoice_base' as verificacion,
  COUNT(*) as total_filas
FROM analytics.invoice_base;

-- 8. Verificar agrupación como en la MV
SELECT 
  'Agrupación MV' as info,
  company_id,
  created_by,
  period_month,
  COUNT(*) as facturas,
  SUM(total_amount) as total
FROM analytics.invoice_base
GROUP BY company_id, created_by, period_month
ORDER BY period_month DESC;

-- 9. Verificar estado de la MV
SELECT 
  'Estado MV' as info,
  schemaname,
  matviewname,
  ispopulated as poblada
FROM pg_matviews
WHERE schemaname = 'analytics' 
  AND matviewname = 'mv_invoice_kpis_monthly';

-- 10. Contar filas en la MV
SELECT 
  'Filas en MV' as info,
  COUNT(*) as total_filas
FROM analytics.mv_invoice_kpis_monthly;

-- 11. Muestra de facturas con detalles
SELECT 
  'Muestra facturas' as info,
  id,
  company_id,
  created_by,
  full_invoice_number,
  invoice_date,
  invoice_month,
  status,
  subtotal,
  tax_amount,
  total
FROM public.invoices
WHERE deleted_at IS NULL
ORDER BY invoice_date DESC
LIMIT 5;
