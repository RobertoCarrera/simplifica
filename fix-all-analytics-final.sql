-- ============================================================
-- FIX COMPLETO: Todas las funciones RPC y refresh de MVs
-- ============================================================
-- Este script:
-- 1. Actualiza get_company_id_from_jwt() para usar ->> (sin double quotes)
-- 2. Actualiza TODAS las funciones RPC para usar get_company_id_from_jwt()
-- 3. Elimina filtro por created_by donde no aplica (tickets no tienen created_by)
-- 4. Hace REFRESH de todas las MVs
-- ============================================================

-- ========== 1) FIX: get_company_id_from_jwt con ->> ==========
CREATE OR REPLACE FUNCTION public.get_company_id_from_jwt()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'company_id')::uuid,
    (auth.jwt() -> 'user_metadata' ->> 'company_id')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
  );
$$;

-- ========== 2) FIX: f_invoice_kpis_monthly ==========
DROP FUNCTION IF EXISTS public.f_invoice_kpis_monthly(date, date);
CREATE OR REPLACE FUNCTION public.f_invoice_kpis_monthly(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
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
SET search_path = public, analytics
AS $$
  SELECT 
    m.company_id,
    m.period_month,
    m.invoices_count,
    m.paid_count,
    m.pending_count,
    m.overdue_count,
    m.cancelled_count,
    m.draft_count,
    m.subtotal_sum,
    m.tax_sum,
    m.total_sum,
    m.collected_sum,
    m.pending_sum,
    m.paid_total_sum,
    m.receivable_sum,
    m.avg_invoice_value,
    m.collection_rate
  FROM analytics.mv_invoice_kpis_monthly m
  WHERE m.company_id = public.get_company_id_from_jwt()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;
GRANT EXECUTE ON FUNCTION public.f_invoice_kpis_monthly(date, date) TO authenticated;

-- ========== 3) FIX: f_quote_kpis_monthly ==========
-- La MV tiene created_by pero lo ignoramos para obtener datos de toda la empresa
DROP FUNCTION IF EXISTS public.f_quote_kpis_monthly(date, date);
CREATE OR REPLACE FUNCTION public.f_quote_kpis_monthly(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  period_month date,
  quotes_count bigint,
  subtotal_sum numeric,
  tax_sum numeric,
  total_sum numeric,
  avg_days_to_accept numeric,
  conversion_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
  -- Agregamos todos los created_by de la misma company
  SELECT 
    m.company_id,
    m.period_month,
    SUM(m.quotes_count)::bigint as quotes_count,
    SUM(m.subtotal_sum) as subtotal_sum,
    SUM(m.tax_sum) as tax_sum,
    SUM(m.total_sum) as total_sum,
    AVG(m.avg_days_to_accept) as avg_days_to_accept,
    AVG(m.conversion_rate) as conversion_rate
  FROM analytics.mv_quote_kpis_monthly m
  WHERE m.company_id = public.get_company_id_from_jwt()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  GROUP BY m.company_id, m.period_month
  ORDER BY m.period_month DESC;
$$;
GRANT EXECUTE ON FUNCTION public.f_quote_kpis_monthly(date, date) TO authenticated;

-- ========== 4) FIX: f_quote_projected_revenue ==========
DROP FUNCTION IF EXISTS public.f_quote_projected_revenue(date, date);
CREATE OR REPLACE FUNCTION public.f_quote_projected_revenue(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  period_month date,
  draft_count bigint,
  subtotal numeric,
  tax_amount numeric,
  grand_total numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
  SELECT
    q.company_id,
    q.quote_month as period_month,
    COUNT(*)::bigint as draft_count,
    COALESCE(SUM(q.subtotal), 0) as subtotal,
    COALESCE(SUM(q.tax_amount), 0) as tax_amount,
    COALESCE(SUM(q.total_amount), 0) as grand_total
  FROM public.quotes q
  WHERE q.company_id = public.get_company_id_from_jwt()
    AND q.status = 'draft'
    AND q.deleted_at IS NULL
    AND (p_start IS NULL OR q.quote_month >= p_start)
    AND (p_end IS NULL OR q.quote_month <= p_end)
  GROUP BY q.company_id, q.quote_month
  ORDER BY q.quote_month DESC;
$$;
GRANT EXECUTE ON FUNCTION public.f_quote_projected_revenue(date, date) TO authenticated;

-- ========== 5) FIX: f_ticket_kpis_monthly ==========
DROP FUNCTION IF EXISTS public.f_ticket_kpis_monthly(date, date);
CREATE OR REPLACE FUNCTION public.f_ticket_kpis_monthly(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  period_month date,
  tickets_created bigint,
  critical_count bigint,
  high_priority_count bigint,
  normal_priority_count bigint,
  low_priority_count bigint,
  open_count bigint,
  in_progress_count bigint,
  completed_count bigint,
  completed_this_month bigint,
  overdue_count bigint,
  total_amount_sum numeric,
  invoiced_amount_sum numeric,
  avg_resolution_days numeric,
  min_resolution_days numeric,
  max_resolution_days numeric,
  resolution_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
  SELECT 
    m.company_id, 
    m.period_month,
    m.tickets_created, 
    m.critical_count, 
    m.high_priority_count, 
    m.normal_priority_count, 
    m.low_priority_count,
    m.open_count, 
    m.in_progress_count, 
    m.completed_count, 
    m.completed_this_month, 
    m.overdue_count,
    m.total_amount_sum, 
    m.invoiced_amount_sum,
    m.avg_resolution_days, 
    m.min_resolution_days, 
    m.max_resolution_days,
    m.resolution_rate
  FROM analytics.mv_ticket_kpis_monthly m
  WHERE m.company_id = public.get_company_id_from_jwt()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;
GRANT EXECUTE ON FUNCTION public.f_ticket_kpis_monthly(date, date) TO authenticated;

-- ========== 6) FIX: f_ticket_current_status ==========
DROP FUNCTION IF EXISTS public.f_ticket_current_status();
CREATE OR REPLACE FUNCTION public.f_ticket_current_status()
RETURNS TABLE (
  company_id uuid,
  total_open bigint,
  total_in_progress bigint,
  total_completed bigint,
  total_overdue bigint,
  critical_open bigint,
  high_open bigint,
  avg_age_days numeric,
  oldest_ticket_days integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
  SELECT 
    tb.company_id,
    COUNT(*) FILTER (WHERE tb.workflow_category = 'waiting' 
      OR (tb.workflow_category IS NULL AND tb.stage_category = 'open')) AS total_open,
    COUNT(*) FILTER (WHERE tb.workflow_category IN ('analysis', 'action')
      OR (tb.workflow_category IS NULL AND tb.stage_category = 'in_progress')) AS total_in_progress,
    COUNT(*) FILTER (WHERE tb.is_completed) AS total_completed,
    COUNT(*) FILTER (WHERE tb.is_overdue) AS total_overdue,
    COUNT(*) FILTER (WHERE NOT tb.is_completed AND (tb.priority = 'critical' OR tb.priority = 'urgent')) AS critical_open,
    COUNT(*) FILTER (WHERE NOT tb.is_completed AND tb.priority = 'high') AS high_open,
    AVG(EXTRACT(EPOCH FROM (NOW() - tb.created_at)) / 86400.0) 
      FILTER (WHERE NOT tb.is_completed)::numeric AS avg_age_days,
    MAX((CURRENT_DATE - tb.created_at::date)) 
      FILTER (WHERE NOT tb.is_completed)::integer AS oldest_ticket_days
  FROM analytics.ticket_base tb
  WHERE tb.company_id = public.get_company_id_from_jwt()
  GROUP BY tb.company_id;
$$;
GRANT EXECUTE ON FUNCTION public.f_ticket_current_status() TO authenticated;

-- ========== 7) REFRESH de todas las MVs ==========
REFRESH MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly;
REFRESH MATERIALIZED VIEW analytics.mv_quote_kpis_monthly;
REFRESH MATERIALIZED VIEW analytics.mv_ticket_kpis_monthly;

-- Refresh opcional de otras MVs si existen
DO $$
BEGIN
  EXECUTE 'REFRESH MATERIALIZED VIEW analytics.mv_quote_top_items_monthly';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'REFRESH MATERIALIZED VIEW analytics.mv_quote_cube';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ========== 8) VERIFICACIÓN ==========
-- Test: Ver qué datos hay en cada MV
SELECT 'MV Facturas' as mv, COUNT(*) as rows, 
       SUM(invoices_count) as total_facturas,
       SUM(total_sum) as total_importe
FROM analytics.mv_invoice_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';

SELECT 'MV Presupuestos' as mv, COUNT(*) as rows,
       SUM(quotes_count) as total_presupuestos,
       SUM(total_sum) as total_importe
FROM analytics.mv_quote_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';

SELECT 'MV Tickets' as mv, COUNT(*) as rows,
       SUM(tickets_created) as total_tickets
FROM analytics.mv_ticket_kpis_monthly
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';

-- Ver detalle de las MVs
SELECT 'Detalle MV Facturas' as source, period_month, invoices_count, total_sum 
FROM analytics.mv_invoice_kpis_monthly 
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
ORDER BY period_month DESC;

SELECT 'Detalle MV Presupuestos' as source, period_month, quotes_count, total_sum 
FROM analytics.mv_quote_kpis_monthly 
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
ORDER BY period_month DESC;

SELECT 'Detalle MV Tickets' as source, period_month, tickets_created
FROM analytics.mv_ticket_kpis_monthly 
WHERE company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
ORDER BY period_month DESC;
