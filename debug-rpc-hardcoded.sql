-- ============================================================
-- FUNCIONES TEMPORALES para debugging
-- ============================================================
-- Estas funciones usan company_id hardcodeado para verificar
-- que el problema es solo el JWT

-- Facturas (temporal, sin JWT)
CREATE OR REPLACE FUNCTION public.f_invoice_kpis_monthly_debug(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  created_by uuid,
  period_month date,
  invoices_count bigint,
  total_sum numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
  SELECT m.company_id, m.created_by, m.period_month,
         m.invoices_count, m.total_sum
  FROM analytics.mv_invoice_kpis_monthly m
  WHERE m.company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'::uuid
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;
GRANT EXECUTE ON FUNCTION public.f_invoice_kpis_monthly_debug(date, date) TO authenticated;

-- Test desde SQL Editor
SELECT 'Debug Facturas' as test, * 
FROM public.f_invoice_kpis_monthly_debug('2025-12-01', '2025-12-31');

-- Test de get_company_id_from_jwt desde SQL Editor (fallará sin JWT)
SELECT 'JWT Function Test' as test,
       public.get_company_id_from_jwt() as company_id,
       auth.uid() as user_id;
