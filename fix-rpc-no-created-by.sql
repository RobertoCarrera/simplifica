-- ============================================================
-- FIX DEFINITIVO: Funciones RPC sin filtro por created_by
-- ============================================================
-- Las facturas tienen created_by diferente a auth.uid()
-- Por eso necesitamos eliminar ese filtro

-- Recrear f_invoice_kpis_monthly SIN filtro por created_by
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
SET search_path = public, analytics
AS $$
  SELECT m.company_id, m.created_by, m.period_month,
         m.invoices_count, m.paid_count, m.pending_count, m.overdue_count, 
         m.cancelled_count, m.draft_count,
         m.subtotal_sum, m.tax_sum, m.total_sum,
         m.collected_sum, m.pending_sum, m.paid_total_sum, m.receivable_sum,
         m.avg_invoice_value, m.collection_rate
  FROM analytics.mv_invoice_kpis_monthly m
  WHERE m.company_id = public.get_company_id_from_jwt()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;

-- Recrear f_quote_kpis_monthly SIN filtro por created_by
CREATE OR REPLACE FUNCTION public.f_quote_kpis_monthly(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  created_by uuid,
  period_month date,
  quotes_count bigint,
  subtotal_sum numeric,
  tax_sum numeric,
  total_sum numeric,
  accepted_count bigint,
  rejected_count bigint,
  expired_count bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
  SELECT m.company_id, m.created_by, m.period_month,
         m.quotes_count, m.subtotal_sum, m.tax_sum, m.total_sum,
         m.accepted_count, m.rejected_count, m.expired_count
  FROM analytics.mv_quote_kpis_monthly m
  WHERE m.company_id = public.get_company_id_from_jwt()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;

-- Test
SELECT 'Facturas' as tipo, COUNT(*) as filas
FROM public.f_invoice_kpis_monthly('2025-12-01', '2025-12-31')
UNION ALL
SELECT 'Presupuestos', COUNT(*)
FROM public.f_quote_kpis_monthly('2025-11-01', '2025-12-31')
UNION ALL
SELECT 'Tickets', COUNT(*)
FROM public.f_ticket_kpis_monthly('2025-12-01', '2025-12-31');
