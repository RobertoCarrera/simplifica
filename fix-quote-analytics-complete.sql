-- ============================================================
-- MEJORAS EN ANALÍTICAS DE PRESUPUESTOS
-- ============================================================
-- 1. Incluir TODOS los estados (incluyendo draft)
-- 2. RESTAR presupuestos ya convertidos a factura
-- 3. Separar métricas para poder agregar recurrentes en frontend

-- Nota: Los recurrentes se suman en el frontend porque vienen de otra función

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
  WITH quote_data AS (
    SELECT 
      q.company_id,
      DATE_TRUNC('month', COALESCE(q.quote_date, q.created_at))::date as period_month,
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
      AND (p_start IS NULL OR DATE_TRUNC('month', COALESCE(q.quote_date, q.created_at))::date >= p_start)
      AND (p_end IS NULL OR DATE_TRUNC('month', COALESCE(q.quote_date, q.created_at))::date <= p_end)
  )
  SELECT 
    qd.company_id,
    qd.period_month,
    -- Total de presupuestos (todos los estados)
    COUNT(*)::bigint as quotes_count,
    -- Borradores
    COUNT(*) FILTER (WHERE qd.status = 'draft')::bigint as draft_count,
    -- Convertidos a factura (estos NO deben contarse en la barra violeta)
    COUNT(*) FILTER (WHERE qd.status = 'invoiced' OR qd.conversion_status = 'invoiced')::bigint as converted_count,
    -- Pendientes activos (draft + sent + pending + accepted, NO invoiced/rejected/cancelled)
    COUNT(*) FILTER (WHERE qd.status IN ('draft', 'sent', 'pending', 'accepted') 
                      AND (qd.conversion_status IS NULL OR qd.conversion_status NOT IN ('invoiced', 'rejected', 'cancelled')))::bigint as pending_count,
    -- Totales SOLO de presupuestos NO convertidos ni rechazados (pipeline activo)
    SUM(CASE 
      WHEN qd.status IN ('draft', 'sent', 'pending', 'accepted')
        AND (qd.conversion_status IS NULL OR qd.conversion_status NOT IN ('invoiced', 'rejected', 'cancelled'))
      THEN qd.subtotal 
      ELSE 0 
    END) as subtotal_sum,
    SUM(CASE 
      WHEN qd.status IN ('draft', 'sent', 'pending', 'accepted')
        AND (qd.conversion_status IS NULL OR qd.conversion_status NOT IN ('invoiced', 'rejected', 'cancelled'))
      THEN qd.tax_amount 
      ELSE 0 
    END) as tax_sum,
    SUM(CASE 
      WHEN qd.status IN ('draft', 'sent', 'pending', 'accepted')
        AND (qd.conversion_status IS NULL OR qd.conversion_status NOT IN ('invoiced', 'rejected', 'cancelled'))
      THEN qd.total_amount 
      ELSE 0 
    END) as total_sum,
    -- Tiempo medio de aceptación
    AVG(qd.days_to_accept) as avg_days_to_accept,
    -- Tasa de conversión
    (COUNT(*) FILTER (WHERE qd.conversion_status = 'accepted')::numeric / NULLIF(COUNT(*), 0)) as conversion_rate
  FROM quote_data qd
  GROUP BY qd.company_id, qd.period_month
  ORDER BY qd.period_month DESC;
$$;

GRANT EXECUTE ON FUNCTION public.f_quote_kpis_monthly_enhanced(date, date) TO authenticated;

COMMENT ON FUNCTION public.f_quote_kpis_monthly_enhanced(date, date) IS 
'Retorna KPIs mejorados de presupuestos:
- Incluye TODOS los estados activos del pipeline (draft, sent, pending, accepted)
- Separa conteo de borradores, convertidos y pendientes
- EXCLUYE del total los presupuestos ya convertidos a factura O rechazados/cancelados
- Los valores subtotal_sum, tax_sum y total_sum solo incluyen presupuestos del pipeline activo
- Pipeline activo = presupuestos que pueden convertirse en facturas (draft, sent, pending, accepted) 
  excluyendo los ya facturados, rechazados o cancelados';

-- ============================================================
-- FUNCIÓN PARA PIPELINE ACTIVO ACTUAL (sin importar fecha de creación)
-- ============================================================
-- Esta función retorna TODOS los presupuestos que están actualmente en pipeline,
-- independientemente de cuándo fueron creados

CREATE OR REPLACE FUNCTION public.f_quote_pipeline_current()
RETURNS TABLE (
  company_id uuid,
  quotes_count bigint,
  draft_count bigint,
  sent_count bigint,
  pending_count bigint,
  accepted_count bigint,
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
    COUNT(*) FILTER (WHERE q.status = 'pending')::bigint as pending_count,
    COUNT(*) FILTER (WHERE q.status = 'accepted')::bigint as accepted_count,
    -- Totales
    COALESCE(SUM(q.subtotal), 0) as subtotal_sum,
    COALESCE(SUM(q.tax_amount), 0) as tax_sum,
    COALESCE(SUM(q.total_amount), 0) as total_sum
  FROM public.quotes q
  WHERE q.company_id = public.get_company_id_from_jwt()
    AND q.deleted_at IS NULL
    -- Solo presupuestos del pipeline activo
    AND q.status IN ('draft', 'sent', 'pending', 'accepted')
    AND (q.conversion_status IS NULL OR q.conversion_status NOT IN ('invoiced', 'rejected', 'cancelled'))
  GROUP BY q.company_id;
$$;

GRANT EXECUTE ON FUNCTION public.f_quote_pipeline_current() TO authenticated;

COMMENT ON FUNCTION public.f_quote_pipeline_current() IS 
'Retorna el pipeline activo ACTUAL de presupuestos, sin importar cuándo fueron creados.
Incluye todos los presupuestos que están en estados activos (draft, sent, pending, accepted)
y que no han sido convertidos, rechazados o cancelados.
Útil para el dashboard del mes actual donde queremos ver TODO el pipeline pendiente.';

-- Test: Ver presupuestos de diciembre 2025 con desglose
SELECT 
  'Diciembre 2025 - KPIs Mejorados' as test,
  quotes_count as total,
  draft_count as borradores,
  converted_count as ya_facturados,
  pending_count as pendientes,
  subtotal_sum as base_imponible,
  total_sum as total_con_iva
FROM public.f_quote_kpis_monthly_enhanced('2025-12-01', '2025-12-31');

-- Test: Ver últimos 6 meses
SELECT 
  period_month,
  quotes_count as total,
  draft_count as draft,
  converted_count as facturados,
  pending_count as pendientes,
  ROUND(subtotal_sum, 2) as subtotal,
  ROUND(total_sum, 2) as total
FROM public.f_quote_kpis_monthly_enhanced(
  (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months')::date,
  (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date
)
ORDER BY period_month;
