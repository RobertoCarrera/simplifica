-- ============================================================
-- ANALYTICS: NUEVA LÓGICA DE PRESUPUESTOS Y FACTURAS
-- ============================================================
-- REGLAS:
-- 1. PRESUPUESTOS: Solo pendientes (draft, sent, viewed, accepted, expired) → Solo mes ACTUAL
-- 2. FACTURAS: Todas las facturas reales + presupuestos con status='invoiced' 
--    Los recurrentes generan "facturas" cada mes según last_run_at
-- ============================================================

-- ============================================================
-- 1. FUNCIÓN DE PRESUPUESTOS - Solo pendientes en mes actual
-- ============================================================
CREATE OR REPLACE FUNCTION public.f_quote_kpis_monthly(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  period_month date,
  quotes_count bigint,
  draft_count bigint,
  converted_count bigint,
  pending_count bigint,
  subtotal_sum numeric,
  tax_sum numeric,
  total_sum numeric,
  avg_days_to_accept numeric,
  conversion_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH current_month AS (
    SELECT DATE_TRUNC('month', CURRENT_DATE)::date as start_date
  ),
  pending_quotes AS (
    SELECT 
      q.company_id,
      -- TODOS los presupuestos pendientes van al mes ACTUAL
      (SELECT start_date FROM current_month) as period_month,
      q.status,
      q.conversion_status,
      COALESCE(q.subtotal, 0) as subtotal,
      COALESCE(q.tax_amount, 0) as tax_amount,
      COALESCE(q.total_amount, 0) as total_amount,
      CASE 
        WHEN q.accepted_at IS NOT NULL 
        THEN EXTRACT(DAY FROM (q.accepted_at - COALESCE(q.quote_date, q.created_at)))
        ELSE NULL 
      END as days_to_accept
    FROM public.quotes q
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.deleted_at IS NULL
      -- Solo presupuestos PENDIENTES (no facturados, no rechazados, no cancelados)
      AND q.status IN ('draft', 'sent', 'viewed', 'accepted', 'expired', 'pending')
      -- conversion_status puede ser NULL o 'not_converted' para pendientes
      AND (q.conversion_status IS NULL OR q.conversion_status = 'not_converted')
  )
  SELECT 
    pq.company_id,
    pq.period_month,
    COUNT(*)::bigint as quotes_count,
    COUNT(*) FILTER (WHERE pq.status = 'draft')::bigint as draft_count,
    0::bigint as converted_count,  -- Los convertidos no están en pendientes
    COUNT(*)::bigint as pending_count,
    COALESCE(SUM(pq.subtotal), 0) as subtotal_sum,
    COALESCE(SUM(pq.tax_amount), 0) as tax_sum,
    COALESCE(SUM(pq.total_amount), 0) as total_sum,
    AVG(pq.days_to_accept) as avg_days_to_accept,
    0::numeric as conversion_rate
  FROM pending_quotes pq
  WHERE (p_start IS NULL OR pq.period_month >= p_start)
    AND (p_end IS NULL OR pq.period_month <= p_end)
  GROUP BY pq.company_id, pq.period_month
  ORDER BY pq.period_month DESC;
$$;

GRANT EXECUTE ON FUNCTION public.f_quote_kpis_monthly(date, date) TO authenticated;

COMMENT ON FUNCTION public.f_quote_kpis_monthly(date, date) IS 
'Retorna KPIs de presupuestos PENDIENTES.
NUEVA LÓGICA: Todos los presupuestos pendientes (draft, sent, viewed, accepted, expired)
se muestran SOLO en el mes ACTUAL, sin importar cuándo fueron creados.
Los presupuestos ya facturados no aparecen aquí (van a facturas).';


-- ============================================================
-- 2. FUNCIÓN DE FACTURAS - Incluye presupuestos recurrentes facturados
-- ============================================================
-- Esta función combina:
-- A) Facturas reales de la tabla invoices
-- B) Presupuestos recurrentes facturados (usando last_run_at para determinar el mes)

CREATE OR REPLACE FUNCTION public.f_invoice_kpis_monthly(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  created_by uuid,
  period_month date,
  invoices_count bigint,
  paid_count bigint,
  pending_count bigint,
  overdue_count bigint,
  cancelled_count bigint,
  draft_count bigint,
  subtotal_sum numeric,
  tax_sum numeric,
  total_sum numeric,
  collected_sum numeric,
  pending_sum numeric,
  paid_total_sum numeric,
  receivable_sum numeric,
  avg_invoice_value numeric,
  collection_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH 
  -- A) Facturas reales de la tabla invoices
  real_invoices AS (
    SELECT 
      i.company_id,
      i.created_by,
      DATE_TRUNC('month', i.invoice_date)::date as period_month,
      i.status,
      COALESCE(i.subtotal, 0) as subtotal,
      COALESCE(i.tax_amount, 0) as tax_amount,
      COALESCE(i.total_amount, 0) as total_amount,
      COALESCE(i.paid_amount, 0) as paid_amount
    FROM public.invoices i
    WHERE i.company_id = public.get_company_id_from_jwt()
      AND i.deleted_at IS NULL
  ),
  -- B) Presupuestos recurrentes facturados (generan factura cada mes según last_run_at)
  recurring_invoiced AS (
    SELECT 
      q.company_id,
      q.created_by,
      -- Usar last_run_at para determinar el mes de la factura
      DATE_TRUNC('month', q.last_run_at)::date as period_month,
      'paid' as status,  -- Los recurrentes se consideran pagados
      COALESCE(q.subtotal, 0) as subtotal,
      COALESCE(q.tax_amount, 0) as tax_amount,
      COALESCE(q.total_amount, 0) as total_amount,
      COALESCE(q.total_amount, 0) as paid_amount  -- Se asume cobrado
    FROM public.quotes q
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.deleted_at IS NULL
      AND q.status = 'invoiced'
      AND q.recurrence_type IS NOT NULL 
      AND q.recurrence_type != 'none'
      AND q.last_run_at IS NOT NULL
  ),
  -- También añadir una entrada para el primer mes (invoiced_at) si es diferente de last_run_at
  recurring_first_invoice AS (
    SELECT 
      q.company_id,
      q.created_by,
      DATE_TRUNC('month', q.invoiced_at)::date as period_month,
      'paid' as status,
      COALESCE(q.subtotal, 0) as subtotal,
      COALESCE(q.tax_amount, 0) as tax_amount,
      COALESCE(q.total_amount, 0) as total_amount,
      COALESCE(q.total_amount, 0) as paid_amount
    FROM public.quotes q
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.deleted_at IS NULL
      AND q.status = 'invoiced'
      AND q.recurrence_type IS NOT NULL 
      AND q.recurrence_type != 'none'
      AND q.invoiced_at IS NOT NULL
      -- Solo si el mes de invoiced_at es diferente del mes de last_run_at
      AND DATE_TRUNC('month', q.invoiced_at)::date != DATE_TRUNC('month', q.last_run_at)::date
  ),
  -- Combinar todas las fuentes
  all_invoices AS (
    SELECT * FROM real_invoices
    UNION ALL
    SELECT * FROM recurring_invoiced
    UNION ALL
    SELECT * FROM recurring_first_invoice
  ),
  -- Filtrar por rango de fechas
  filtered_invoices AS (
    SELECT *
    FROM all_invoices
    WHERE (p_start IS NULL OR period_month >= p_start)
      AND (p_end IS NULL OR period_month <= p_end)
  )
  SELECT 
    fi.company_id,
    fi.created_by,
    fi.period_month,
    COUNT(*)::bigint as invoices_count,
    COUNT(*) FILTER (WHERE fi.status = 'paid')::bigint as paid_count,
    COUNT(*) FILTER (WHERE fi.status IN ('sent', 'pending', 'viewed'))::bigint as pending_count,
    COUNT(*) FILTER (WHERE fi.status = 'overdue')::bigint as overdue_count,
    COUNT(*) FILTER (WHERE fi.status = 'cancelled')::bigint as cancelled_count,
    COUNT(*) FILTER (WHERE fi.status = 'draft')::bigint as draft_count,
    COALESCE(SUM(fi.subtotal), 0) as subtotal_sum,
    COALESCE(SUM(fi.tax_amount), 0) as tax_sum,
    COALESCE(SUM(fi.total_amount), 0) as total_sum,
    COALESCE(SUM(fi.paid_amount), 0) as collected_sum,
    COALESCE(SUM(fi.total_amount) FILTER (WHERE fi.status IN ('sent', 'pending', 'viewed')), 0) as pending_sum,
    COALESCE(SUM(fi.total_amount) FILTER (WHERE fi.status = 'paid'), 0) as paid_total_sum,
    COALESCE(SUM(fi.total_amount) FILTER (WHERE fi.status IN ('sent', 'pending', 'viewed', 'overdue')), 0) as receivable_sum,
    AVG(fi.total_amount) as avg_invoice_value,
    (COUNT(*) FILTER (WHERE fi.status = 'paid')::numeric / NULLIF(COUNT(*), 0)) as collection_rate
  FROM filtered_invoices fi
  GROUP BY fi.company_id, fi.created_by, fi.period_month
  ORDER BY fi.period_month DESC;
$$;

GRANT EXECUTE ON FUNCTION public.f_invoice_kpis_monthly(date, date) TO authenticated;

COMMENT ON FUNCTION public.f_invoice_kpis_monthly(date, date) IS 
'Retorna KPIs de facturas.
NUEVA LÓGICA: Combina facturas reales de la tabla invoices + 
presupuestos recurrentes facturados (cada ejecución genera una factura virtual).
Los recurrentes aparecen tanto en el mes de invoiced_at como en last_run_at.';


-- ============================================================
-- 3. FUNCIÓN PIPELINE ACTUAL - Presupuestos pendientes totales
-- ============================================================
-- Esta función retorna TODOS los presupuestos pendientes (sin filtro de mes)
-- Se usa para mostrar el valor total del pipeline en el mes actual

CREATE OR REPLACE FUNCTION public.f_quote_pipeline_current()
RETURNS TABLE (
  company_id uuid,
  quotes_count bigint,
  draft_count bigint,
  sent_count bigint,
  viewed_count bigint,
  pending_count bigint,
  accepted_count bigint,
  expired_count bigint,
  subtotal_sum numeric,
  tax_sum numeric,
  total_sum numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    q.company_id,
    -- Total de presupuestos activos (pipeline)
    COUNT(*)::bigint as quotes_count,
    -- Por estado
    COUNT(*) FILTER (WHERE q.status = 'draft')::bigint as draft_count,
    COUNT(*) FILTER (WHERE q.status = 'sent')::bigint as sent_count,
    COUNT(*) FILTER (WHERE q.status = 'viewed')::bigint as viewed_count,
    COUNT(*) FILTER (WHERE q.status = 'pending')::bigint as pending_count,
    COUNT(*) FILTER (WHERE q.status = 'accepted')::bigint as accepted_count,
    COUNT(*) FILTER (WHERE q.status = 'expired')::bigint as expired_count,
    -- Totales
    COALESCE(SUM(q.subtotal), 0) as subtotal_sum,
    COALESCE(SUM(q.tax_amount), 0) as tax_sum,
    COALESCE(SUM(q.total_amount), 0) as total_sum
  FROM public.quotes q
  WHERE q.company_id = public.get_company_id_from_jwt()
    AND q.deleted_at IS NULL
    -- Solo presupuestos del pipeline activo (TODOS los pendientes)
    AND q.status IN ('draft', 'sent', 'viewed', 'pending', 'accepted', 'expired')
    -- Excluir los que ya fueron convertidos/facturados/rechazados/cancelados
    AND (q.conversion_status IS NULL OR q.conversion_status = 'not_converted')
  GROUP BY q.company_id;
$$;

GRANT EXECUTE ON FUNCTION public.f_quote_pipeline_current() TO authenticated;

COMMENT ON FUNCTION public.f_quote_pipeline_current() IS 
'Retorna el pipeline completo de presupuestos pendientes.
INCLUYE: draft, sent, viewed, pending, accepted, expired
EXCLUYE: conversion_status = converted, invoiced, rejected, cancelled
Se usa para mostrar el valor total del pipeline en el dashboard.';


-- ============================================================
-- 4. VERIFICACIONES
-- ============================================================

-- Presupuestos pendientes (solo deberían aparecer en diciembre = mes actual)
SELECT 
  'PRESUPUESTOS PENDIENTES' as tipo,
  period_month,
  quotes_count,
  pending_count,
  ROUND(total_sum, 2) as total
FROM public.f_quote_kpis_monthly(NULL, NULL);

-- Facturas (octubre y noviembre deberían tener los recurrentes)
SELECT 
  'FACTURAS' as tipo,
  period_month,
  invoices_count,
  paid_count,
  ROUND(total_sum, 2) as total_facturado,
  ROUND(collected_sum, 2) as cobrado
FROM public.f_invoice_kpis_monthly('2025-10-01', '2025-12-31');

-- Detalle: ver qué presupuestos recurrentes hay
SELECT 
  quote_number,
  title,
  status,
  recurrence_type,
  TO_CHAR(invoiced_at, 'YYYY-MM-DD') as facturado_inicial,
  TO_CHAR(last_run_at, 'YYYY-MM-DD') as ultima_facturacion,
  TO_CHAR(next_run_at, 'YYYY-MM-DD') as proxima,
  ROUND(total_amount, 2) as total
FROM quotes
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
  AND recurrence_type IS NOT NULL 
  AND recurrence_type != 'none'
ORDER BY quote_number;
