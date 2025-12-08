-- ============================================================
-- FIX: Funciones RPC que leen company_id directamente del JWT
-- ============================================================
-- En lugar de usar get_user_company_id(), leen directamente
-- de auth.jwt() -> 'company_id'

-- 1. Función auxiliar para obtener company_id del JWT
CREATE OR REPLACE FUNCTION public.get_company_id_from_jwt()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'company_id')::text::uuid,
    (auth.jwt() -> 'user_metadata' -> 'company_id')::text::uuid,
    (auth.jwt() -> 'app_metadata' -> 'company_id')::text::uuid
  );
$$;

-- 2. Recrear f_invoice_kpis_monthly con la nueva función
DROP FUNCTION IF EXISTS public.f_invoice_kpis_monthly(date, date);
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
    AND m.created_by = auth.uid()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;

-- 3. Recrear f_ticket_kpis_monthly
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
  overdue_count bigint,
  avg_resolution_days numeric,
  sla_compliance_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
  SELECT m.company_id, m.period_month,
         m.tickets_created, m.critical_count, m.high_priority_count,
         m.normal_priority_count, m.low_priority_count,
         m.open_count, m.in_progress_count, m.completed_count,
         m.overdue_count, m.avg_resolution_days, m.sla_compliance_rate
  FROM analytics.mv_ticket_kpis_monthly m
  WHERE m.company_id = public.get_company_id_from_jwt()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;

-- 4. Recrear f_quote_kpis_monthly
DROP FUNCTION IF EXISTS public.f_quote_kpis_monthly(date, date);
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
    AND m.created_by = auth.uid()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;

-- 5. Test de la nueva función
SELECT 'Test nueva función' as test,
       COUNT(*) as filas_devueltas
FROM public.f_invoice_kpis_monthly('2025-12-01', '2025-12-31');

-- Verificar que la función auxiliar funciona
SELECT 'Company ID from JWT' as test,
       public.get_company_id_from_jwt() as company_id;
