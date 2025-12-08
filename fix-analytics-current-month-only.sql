-- ============================================================
-- NUEVO COMPORTAMIENTO DE ANALÍTICAS
-- ============================================================
-- REGLA: Los presupuestos SOLO aparecen en el mes ACTUAL
-- Motivo: Son elementos que deben resolverse (aceptar/rechazar/caducar)
-- 
-- En meses pasados: Solo facturas
-- Los presupuestos pendientes se arrastran al mes actual

-- ============================================================
-- 1. MODIFICAR f_quote_kpis_monthly_enhanced
-- ============================================================
-- Nueva lógica:
-- - Si el mes solicitado es el mes ACTUAL → Mostrar TODOS los presupuestos pendientes (de cualquier fecha)
-- - Si el mes solicitado es PASADO → Mostrar CERO presupuestos (solo facturas)

CREATE OR REPLACE FUNCTION public.f_quote_kpis_monthly_enhanced(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
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
  WITH current_month_start AS (
    SELECT DATE_TRUNC('month', CURRENT_DATE)::date as month_start
  ),
  quote_data AS (
    SELECT 
      q.company_id,
      -- Para meses pasados: usar quote_date
      -- Para mes actual: forzar a mes actual
      CASE 
        WHEN DATE_TRUNC('month', COALESCE(q.quote_date, q.created_at))::date < (SELECT month_start FROM current_month_start)
          AND q.status IN ('draft', 'sent', 'pending', 'accepted')
          AND (q.conversion_status IS NULL OR q.conversion_status NOT IN ('converted', 'rejected', 'cancelled'))
        THEN (SELECT month_start FROM current_month_start)  -- Arrastrar al mes actual
        ELSE DATE_TRUNC('month', COALESCE(q.quote_date, q.created_at))::date
      END as period_month,
      q.status,
      q.conversion_status,
      COALESCE(q.subtotal, 0) as subtotal,
      COALESCE(q.tax_amount, 0) as tax_amount,
      COALESCE(q.total_amount, 0) as total_amount,
      CASE 
        WHEN q.accepted_at IS NOT NULL 
        THEN EXTRACT(DAY FROM (q.accepted_at - COALESCE(q.quote_date, q.created_at)))
        ELSE NULL 
      END as days_to_accept,
      -- Flag para identificar si es del mes actual o arrastrado
      CASE 
        WHEN DATE_TRUNC('month', COALESCE(q.quote_date, q.created_at))::date < (SELECT month_start FROM current_month_start)
          AND q.status IN ('draft', 'sent', 'pending', 'accepted')
          AND (q.conversion_status IS NULL OR q.conversion_status NOT IN ('converted', 'rejected', 'cancelled'))
        THEN TRUE
        ELSE FALSE
      END as is_dragged
    FROM public.quotes q
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.deleted_at IS NULL
      -- Solo incluir presupuestos activos (no convertidos, rechazados o cancelados)
      AND (
        q.status IN ('draft', 'sent', 'pending', 'accepted')
        OR q.conversion_status IN ('converted')  -- Convertidos para stats históricas
      )
  ),
  filtered_data AS (
    SELECT *
    FROM quote_data
    WHERE (p_start IS NULL OR period_month >= p_start)
      AND (p_end IS NULL OR period_month <= p_end)
  )
  SELECT 
    qd.company_id,
    qd.period_month,
    -- Total de presupuestos en este periodo
    COUNT(*)::bigint as quotes_count,
    -- Borradores
    COUNT(*) FILTER (WHERE qd.status = 'draft')::bigint as draft_count,
    -- Convertidos a factura
    COUNT(*) FILTER (WHERE qd.conversion_status = 'converted')::bigint as converted_count,
    -- Pendientes activos (draft + sent + pending + accepted, NO converted)
    COUNT(*) FILTER (WHERE qd.status IN ('draft', 'sent', 'pending', 'accepted') 
                      AND (qd.conversion_status IS NULL OR qd.conversion_status != 'converted'))::bigint as pending_count,
    -- Totales SOLO de presupuestos NO convertidos (pipeline activo)
    SUM(CASE 
      WHEN qd.status IN ('draft', 'sent', 'pending', 'accepted')
        AND (qd.conversion_status IS NULL OR qd.conversion_status != 'converted')
      THEN qd.subtotal 
      ELSE 0 
    END) as subtotal_sum,
    SUM(CASE 
      WHEN qd.status IN ('draft', 'sent', 'pending', 'accepted')
        AND (qd.conversion_status IS NULL OR qd.conversion_status != 'converted')
      THEN qd.tax_amount 
      ELSE 0 
    END) as tax_sum,
    SUM(CASE 
      WHEN qd.status IN ('draft', 'sent', 'pending', 'accepted')
        AND (qd.conversion_status IS NULL OR qd.conversion_status != 'converted')
      THEN qd.total_amount 
      ELSE 0 
    END) as total_sum,
    -- Tiempo medio de aceptación
    AVG(qd.days_to_accept) as avg_days_to_accept,
    -- Tasa de conversión
    (COUNT(*) FILTER (WHERE qd.conversion_status = 'converted')::numeric / NULLIF(COUNT(*), 0)) as conversion_rate
  FROM filtered_data qd
  GROUP BY qd.company_id, qd.period_month
  ORDER BY qd.period_month DESC;
$$;

GRANT EXECUTE ON FUNCTION public.f_quote_kpis_monthly_enhanced(date, date) TO authenticated;

COMMENT ON FUNCTION public.f_quote_kpis_monthly_enhanced(date, date) IS 
'Retorna KPIs de presupuestos con nueva lógica:
- PRESUPUESTOS SOLO EN MES ACTUAL: Todos los presupuestos pendientes (de cualquier fecha) se muestran en el mes actual
- MESES PASADOS: Solo facturas convertidas (los pendientes se arrastran al actual)
- Pipeline activo = presupuestos que pueden convertirse en facturas
- Esta lógica hace que los presupuestos sean elementos que deben resolverse en el mes actual';


-- ============================================================
-- 2. MODIFICAR f_quote_pipeline_current
-- ============================================================
-- Esta función ya está bien, solo obtiene presupuestos pendientes sin filtro de mes

CREATE OR REPLACE FUNCTION public.f_quote_pipeline_current()
RETURNS TABLE (
  company_id uuid,
  total_pipeline_quotes bigint,
  total_pipeline_amount numeric,
  recurring_pipeline_quotes bigint,
  recurring_pipeline_amount numeric,
  normal_pipeline_quotes bigint,
  normal_pipeline_amount numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH active_quotes AS (
    SELECT 
      q.company_id,
      q.total_amount,
      q.recurrence_type
    FROM public.quotes q
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.deleted_at IS NULL
      AND q.status IN ('draft', 'sent', 'pending', 'accepted')
      AND (q.conversion_status IS NULL OR q.conversion_status NOT IN ('converted', 'rejected', 'cancelled'))
  )
  SELECT 
    aq.company_id,
    -- Total general
    COUNT(*)::bigint as total_pipeline_quotes,
    COALESCE(SUM(aq.total_amount), 0) as total_pipeline_amount,
    -- Recurrentes
    COUNT(*) FILTER (WHERE aq.recurrence_type IS NOT NULL AND aq.recurrence_type != 'none')::bigint as recurring_pipeline_quotes,
    COALESCE(SUM(aq.total_amount) FILTER (WHERE aq.recurrence_type IS NOT NULL AND aq.recurrence_type != 'none'), 0) as recurring_pipeline_amount,
    -- Normales
    COUNT(*) FILTER (WHERE aq.recurrence_type IS NULL OR aq.recurrence_type = 'none')::bigint as normal_pipeline_quotes,
    COALESCE(SUM(aq.total_amount) FILTER (WHERE aq.recurrence_type IS NULL OR aq.recurrence_type = 'none'), 0) as normal_pipeline_amount
  FROM active_quotes aq
  GROUP BY aq.company_id;
$$;

GRANT EXECUTE ON FUNCTION public.f_quote_pipeline_current() TO authenticated;

COMMENT ON FUNCTION public.f_quote_pipeline_current() IS 
'Retorna el pipeline completo de presupuestos pendientes sin filtro de mes.
Incluye separación entre recurrentes y normales.
Usado para mostrar todos los presupuestos activos en el mes actual.';


-- ============================================================
-- 3. VERIFICACIÓN
-- ============================================================

-- Ver presupuestos del mes ACTUAL (debe mostrar TODOS los pendientes)
SELECT 
  period_month,
  quotes_count,
  pending_count,
  ROUND(subtotal_sum, 2) as subtotal,
  ROUND(total_sum, 2) as total
FROM public.f_quote_kpis_monthly_enhanced(
  DATE_TRUNC('month', CURRENT_DATE)::date,
  DATE_TRUNC('month', CURRENT_DATE)::date
);

-- Ver presupuestos de OCTUBRE (debe mostrar CERO pendientes, solo convertidos)
SELECT 
  period_month,
  quotes_count,
  pending_count,
  converted_count,
  ROUND(subtotal_sum, 2) as subtotal,
  ROUND(total_sum, 2) as total
FROM public.f_quote_kpis_monthly_enhanced('2025-10-01', '2025-10-31');

-- Ver presupuestos de NOVIEMBRE (debe mostrar CERO pendientes, solo el dropshipping si fue rechazado)
SELECT 
  period_month,
  quotes_count,
  pending_count,
  converted_count,
  ROUND(subtotal_sum, 2) as subtotal,
  ROUND(total_sum, 2) as total
FROM public.f_quote_kpis_monthly_enhanced('2025-11-01', '2025-11-30');

-- Pipeline actual (todos los presupuestos pendientes)
SELECT * FROM public.f_quote_pipeline_current();
