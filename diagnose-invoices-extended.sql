-- ============================================================
-- Script de diagnóstico EXTENDIDO para facturas
-- ============================================================

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

-- 4. Verificar invoice_base con campos de agrupación
SELECT 
  'invoice_base - agrupación' as verificacion,
  company_id,
  created_by,
  period_month,
  COUNT(*) as facturas
FROM analytics.invoice_base
GROUP BY company_id, created_by, period_month
ORDER BY period_month DESC
LIMIT 10;

-- 5. Simular el query de la MV
SELECT 
  'Simulación MV' as info,
  ib.company_id,
  ib.created_by,
  ib.period_month,
  COUNT(*) AS invoices_count,
  SUM(ib.subtotal) AS subtotal_sum,
  SUM(ib.tax_amount) AS tax_sum,
  SUM(ib.total_amount) AS total_sum
FROM analytics.invoice_base ib
GROUP BY ib.company_id, ib.created_by, ib.period_month
ORDER BY ib.period_month DESC
LIMIT 5;

-- 6. Verificar contexto de usuario actual
SELECT 
  'Contexto usuario' as info,
  auth.uid() as user_id,
  public.get_user_company_id() as company_id;

-- 7. Verificar si invoice_base está vacía
SELECT 
  'Total en invoice_base' as verificacion,
  COUNT(*) as total_filas
FROM analytics.invoice_base;

-- 8. Muestra detallada de facturas con todos los campos
SELECT 
  'Detalle facturas' as info,
  id,
  company_id,
  created_by,
  invoice_date,
  invoice_month,
  status,
  total,
  deleted_at
FROM public.invoices
ORDER BY invoice_date DESC
LIMIT 3;
