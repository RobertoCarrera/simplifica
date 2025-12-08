-- ============================================================
-- FUNCIÓN MEJORADA: Calcular presupuestos recurrentes del mes actual
-- ============================================================
-- Retorna presupuestos que deben convertirse a factura este mes
-- Calcula next_run_at dinámicamente si es NULL basándose en recurrence_day

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
  recurring_with_calculated_date AS (
    SELECT 
      q.company_id,
      q.subtotal,
      q.tax_amount,
      q.total_amount,
      -- Calcular next_run_at si es NULL basándose en recurrence_day y recurrence_type
      COALESCE(
        q.next_run_at::date,
        q.scheduled_conversion_date,
        -- Si es mensual y tiene recurrence_day, usar ese día del mes actual/siguiente
        CASE 
          WHEN q.recurrence_type = 'monthly' AND q.recurrence_day IS NOT NULL THEN
            CASE
              -- Si el día ya pasó este mes, usar el próximo mes
              WHEN q.recurrence_day < EXTRACT(DAY FROM CURRENT_DATE) THEN
                (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' + (q.recurrence_day - 1 || ' days')::INTERVAL)::date
              -- Si el día es hoy o futuro, usar este mes
              ELSE
                (DATE_TRUNC('month', CURRENT_DATE) + (q.recurrence_day - 1 || ' days')::INTERVAL)::date
            END
          -- Si es trimestral, calcular 3 meses después de la última factura
          WHEN q.recurrence_type = 'quarterly' AND q.last_run_at IS NOT NULL THEN
            (q.last_run_at + INTERVAL '3 months')::date
          -- Si es anual, calcular 1 año después
          WHEN q.recurrence_type = 'yearly' AND q.last_run_at IS NOT NULL THEN
            (q.last_run_at + INTERVAL '1 year')::date
          -- Default: usar el día de hoy
          ELSE CURRENT_DATE
        END
      ) as calculated_next_run
    FROM public.quotes q, target_period tp
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.recurrence_type != 'none'
      -- Incluir estados que permiten facturación recurrente
      AND q.status IN ('draft', 'sent', 'pending', 'accepted', 'invoiced')
      AND q.deleted_at IS NULL
      -- Si tiene fecha de fin, verificar que no haya expirado
      AND (q.recurrence_end_date IS NULL OR q.recurrence_end_date >= tp.start_date)
  )
  SELECT 
    r.company_id,
    DATE_TRUNC('month', r.calculated_next_run)::date as period_month,
    COUNT(*)::bigint as recurring_count,
    COALESCE(SUM(r.subtotal), 0) as subtotal,
    COALESCE(SUM(r.tax_amount), 0) as tax_amount,
    COALESCE(SUM(r.total_amount), 0) as grand_total
  FROM recurring_with_calculated_date r, target_period tp
  WHERE r.calculated_next_run BETWEEN tp.start_date AND tp.end_date
  GROUP BY r.company_id, period_month
  ORDER BY period_month DESC;
$$;

GRANT EXECUTE ON FUNCTION public.f_quote_recurring_monthly(date, date) TO authenticated;

COMMENT ON FUNCTION public.f_quote_recurring_monthly(date, date) IS 
'Retorna presupuestos recurrentes que deben convertirse a factura en el período especificado. Calcula next_run_at dinámicamente si es NULL.';

-- Test: Ver recurrentes de diciembre 2025
SELECT 'Recurrentes Diciembre' as test, * 
FROM public.f_quote_recurring_monthly('2025-12-01', '2025-12-31');

-- Test: Ver todos los presupuestos recurrentes con fecha calculada
SELECT 
  quote_number,
  status,
  recurrence_type,
  recurrence_interval,
  recurrence_day,
  next_run_at,
  last_run_at,
  scheduled_conversion_date,
  recurrence_end_date,
  -- Calcular next_run_at dinámicamente
  COALESCE(
    next_run_at::date,
    scheduled_conversion_date,
    CASE 
      WHEN recurrence_type = 'monthly' AND recurrence_day IS NOT NULL THEN
        CASE
          WHEN recurrence_day < EXTRACT(DAY FROM CURRENT_DATE) THEN
            (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' + (recurrence_day - 1 || ' days')::INTERVAL)::date
          ELSE
            (DATE_TRUNC('month', CURRENT_DATE) + (recurrence_day - 1 || ' days')::INTERVAL)::date
        END
      WHEN recurrence_type = 'quarterly' AND last_run_at IS NOT NULL THEN
        (last_run_at + INTERVAL '3 months')::date
      WHEN recurrence_type = 'yearly' AND last_run_at IS NOT NULL THEN
        (last_run_at + INTERVAL '1 year')::date
      ELSE CURRENT_DATE
    END
  ) as calculated_next_run,
  subtotal,
  total_amount
FROM quotes
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
  AND recurrence_type != 'none'
  AND deleted_at IS NULL
ORDER BY calculated_next_run ASC NULLS LAST;
