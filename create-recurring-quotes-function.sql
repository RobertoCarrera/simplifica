-- ============================================================
-- FUNCIÓN: Calcular presupuestos recurrentes del mes actual
-- ============================================================
-- Retorna presupuestos que deben convertirse a factura este mes
-- según next_run_at o scheduled_conversion_date

CREATE OR REPLACE FUNCTION public.f_quote_recurring_monthly(
  p_start date DEFAULT NULL, 
  p_end date DEFAULT NULL
)
RETURNS TABLE (
  company_id uuid,
  period_month date,
  recurring_count bigint,
  subtotal numeric,
  tax_amount numeric,
  grand_total numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH target_period AS (
    SELECT 
      COALESCE(p_start, DATE_TRUNC('month', CURRENT_DATE)::date) as start_date,
      COALESCE(p_end, (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date) as end_date
  ),
  recurring_this_month AS (
    SELECT 
      q.company_id,
      DATE_TRUNC('month', COALESCE(q.next_run_at::date, q.scheduled_conversion_date))::date as period_month,
      q.subtotal,
      q.tax_amount,
      q.total_amount
    FROM public.quotes q, target_period tp
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.recurrence_type != 'none'
      AND q.status IN ('draft', 'sent', 'pending')
      AND q.deleted_at IS NULL
      -- El presupuesto debe ejecutarse en el rango de fechas especificado
      AND (
        (q.next_run_at IS NOT NULL AND q.next_run_at::date BETWEEN tp.start_date AND tp.end_date)
        OR (q.scheduled_conversion_date IS NOT NULL AND q.scheduled_conversion_date BETWEEN tp.start_date AND tp.end_date)
      )
      -- Si tiene fecha de fin, verificar que no haya expirado
      AND (q.recurrence_end_date IS NULL OR q.recurrence_end_date >= tp.start_date)
  )
  SELECT 
    r.company_id,
    r.period_month,
    COUNT(*)::bigint as recurring_count,
    COALESCE(SUM(r.subtotal), 0) as subtotal,
    COALESCE(SUM(r.tax_amount), 0) as tax_amount,
    COALESCE(SUM(r.total_amount), 0) as grand_total
  FROM recurring_this_month r
  GROUP BY r.company_id, r.period_month
  ORDER BY r.period_month DESC;
$$;

GRANT EXECUTE ON FUNCTION public.f_quote_recurring_monthly(date, date) TO authenticated;

COMMENT ON FUNCTION public.f_quote_recurring_monthly(date, date) IS 
'Retorna presupuestos recurrentes que deben convertirse a factura en el período especificado';

-- Test: Ver recurrentes de diciembre 2025
SELECT 'Recurrentes Diciembre' as test, * 
FROM public.f_quote_recurring_monthly('2025-12-01', '2025-12-31');

-- Test: Ver todos los presupuestos recurrentes activos
SELECT 
  quote_number,
  status,
  recurrence_type,
  recurrence_interval,
  recurrence_day,
  next_run_at,
  scheduled_conversion_date,
  recurrence_end_date,
  subtotal,
  total_amount
FROM quotes
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
  AND recurrence_type != 'none'
  AND deleted_at IS NULL
ORDER BY next_run_at ASC NULLS LAST;
