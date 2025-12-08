-- ============================================================
-- FUNCIONES RPC TEMPORALES - Sin filtro por created_by
-- ============================================================
-- Estas funciones NO filtran por created_by, solo por company_id
-- Útil para diagnosticar si el problema es el Auth Hook

-- Facturas (versión sin created_by)
CREATE OR REPLACE FUNCTION public.f_invoice_kpis_monthly_temp(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
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
  WHERE m.company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;
GRANT EXECUTE ON FUNCTION public.f_invoice_kpis_monthly_temp(date, date) TO authenticated;

-- Test directo
SELECT * FROM public.f_invoice_kpis_monthly_temp('2025-12-01', '2025-12-31');
