-- ========= ANALYTICS DATA MART - FACTURAS ==========
-- Complemento al datamart de presupuestos para métricas de facturación
-- Compatible con RLS/GDPR; usa JWT custom claims para company_id
-- Fecha: 2025-11-29

-- ========= LIMPIEZA PREVIA ==========
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_invoice_kpis_monthly CASCADE;
DROP VIEW IF EXISTS analytics.invoice_base CASCADE;
DROP FUNCTION IF EXISTS public.f_invoice_kpis_monthly(date, date);
DROP FUNCTION IF EXISTS public.f_invoice_collection_status(date, date);

-- ========= 1) Columna física de mes en invoices (si no existe) =======
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_month date;

UPDATE public.invoices
SET invoice_month = DATE_TRUNC('month', COALESCE(invoice_date, created_at))::date
WHERE invoice_month IS NULL;
CREATE OR REPLACE FUNCTION public.set_invoice_month() RETURNS TRIGGER AS $$
BEGIN
  NEW.invoice_month := DATE_TRUNC('month', COALESCE(NEW.invoice_date, NEW.created_at))::date;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_invoice_month ON public.invoices;
CREATE TRIGGER trg_set_invoice_month
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.set_invoice_month();

-- ========== 2) ÍNDICES OPTIMIZADOS ==========
CREATE INDEX IF NOT EXISTS ix_invoices_company_created_month
  ON public.invoices (company_id, created_by, invoice_month);
CREATE INDEX IF NOT EXISTS ix_invoices_status
  ON public.invoices (status);
CREATE INDEX IF NOT EXISTS ix_invoices_date
  ON public.invoices (invoice_date DESC);

-- ========== 3) VISTA BASE DE FACTURAS ==========
CREATE OR REPLACE VIEW analytics.invoice_base AS
SELECT
  i.id AS invoice_id,
  i.company_id AS company_id,
  i.created_by AS created_by,
  i.client_id AS client_id,
  COALESCE(i.subtotal, 0)::numeric AS subtotal,
  COALESCE(i.tax_amount, 0)::numeric AS tax_amount,
  COALESCE(i.total, 0)::numeric AS total_amount,
  COALESCE(i.paid_amount, 0)::numeric AS paid_amount,
  (COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0))::numeric AS pending_amount,
  i.status AS status,
  i.invoice_type AS invoice_type,
  i.invoice_date AS invoice_date,
  i.due_date AS due_date,
  i.invoice_month AS period_month,
  -- Calcular días hasta vencimiento o días vencida (date - date = integer en PostgreSQL)
  (CASE 
    WHEN i.status = 'paid' THEN 0
    WHEN i.due_date < CURRENT_DATE THEN -(CURRENT_DATE - i.due_date)
    ELSE (i.due_date - CURRENT_DATE)
  END)::integer AS days_to_due,
  -- Flag de vencida
  (i.due_date < CURRENT_DATE AND i.status NOT IN ('paid', 'cancelled', 'draft')) AS is_overdue
FROM public.invoices i
WHERE i.deleted_at IS NULL;

-- ========== 4) MATERIALIZED VIEW: KPIs Mensuales de Facturas ==========
CREATE MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly AS
SELECT
  ib.company_id,
  ib.created_by,
  ib.period_month,
  -- Conteos
  COUNT(*) AS invoices_count,
  COUNT(*) FILTER (WHERE ib.status = 'paid') AS paid_count,
  COUNT(*) FILTER (WHERE ib.status IN ('sent', 'partial')) AS pending_count,
  COUNT(*) FILTER (WHERE ib.status = 'overdue' OR ib.is_overdue) AS overdue_count,
  COUNT(*) FILTER (WHERE ib.status = 'cancelled') AS cancelled_count,
  COUNT(*) FILTER (WHERE ib.status = 'draft') AS draft_count,
  -- Importes base
  SUM(ib.subtotal) AS subtotal_sum,
  SUM(ib.tax_amount) AS tax_sum,
  SUM(ib.total_amount) AS total_sum,
  -- Importes por estado de cobro
  SUM(ib.paid_amount) AS collected_sum,
  SUM(ib.pending_amount) AS pending_sum,
  SUM(ib.total_amount) FILTER (WHERE ib.status = 'paid') AS paid_total_sum,
  SUM(ib.total_amount) FILTER (WHERE ib.status IN ('sent', 'partial', 'overdue') OR ib.is_overdue) AS receivable_sum,
  -- Métricas promedio
  AVG(ib.total_amount)::numeric AS avg_invoice_value,
  -- Tasa de cobro
  (SUM(ib.paid_amount) / NULLIF(SUM(ib.total_amount), 0))::numeric AS collection_rate
FROM analytics.invoice_base ib
GROUP BY ib.company_id, ib.created_by, ib.period_month
WITH NO DATA;

CREATE UNIQUE INDEX ux_mv_invoice_kpis_monthly
  ON analytics.mv_invoice_kpis_monthly (company_id, created_by, period_month);

-- ========== 5) SEGURIDAD: Restringir acceso directo a MVs ==========
REVOKE ALL ON TABLE analytics.mv_invoice_kpis_monthly FROM PUBLIC;

-- ========== 6) FUNCIONES RPC SEGURAS ==========

-- 6.1) KPIs mensuales de facturas
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
  WHERE m.company_id = public.get_user_company_id()
    AND m.created_by = auth.uid()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;
GRANT EXECUTE ON FUNCTION public.f_invoice_kpis_monthly(date, date) TO authenticated;

-- 6.2) Estado de cobro actual (para tarjetas de resumen)
CREATE OR REPLACE FUNCTION public.f_invoice_collection_status(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  created_by uuid,
  total_invoiced numeric,
  total_collected numeric,
  total_pending numeric,
  total_overdue numeric,
  overdue_count bigint,
  avg_days_overdue numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
  SELECT 
    ib.company_id,
    ib.created_by,
    SUM(ib.total_amount) AS total_invoiced,
    SUM(ib.paid_amount) AS total_collected,
    SUM(ib.pending_amount) AS total_pending,
    SUM(ib.pending_amount) FILTER (WHERE ib.is_overdue) AS total_overdue,
    COUNT(*) FILTER (WHERE ib.is_overdue) AS overdue_count,
    AVG(ABS(ib.days_to_due)) FILTER (WHERE ib.is_overdue)::numeric AS avg_days_overdue
  FROM analytics.invoice_base ib
  WHERE ib.company_id = public.get_user_company_id()
    AND ib.created_by = auth.uid()
    AND ib.status NOT IN ('cancelled', 'draft')
    AND (p_start IS NULL OR ib.period_month >= p_start)
    AND (p_end   IS NULL OR ib.period_month <= p_end)
  GROUP BY ib.company_id, ib.created_by;
$$;
GRANT EXECUTE ON FUNCTION public.f_invoice_collection_status(date, date) TO authenticated;

-- ========== 7) ACTUALIZAR PROCEDIMIENTO DE REFRESH ==========
-- Añadir la MV de facturas al refresh existente
CREATE OR REPLACE PROCEDURE public.refresh_analytics_materialized_views()
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, analytics
AS $$
BEGIN
  -- Presupuestos
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_kpis_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_top_items_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_cube;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  -- Facturas
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_invoice_kpis_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
END;
$$;
GRANT EXECUTE ON PROCEDURE public.refresh_analytics_materialized_views() TO authenticated;

-- Actualizar el job de pg_cron si existe
DO $$
DECLARE
  v_exists boolean;
BEGIN
  -- Eliminar job antiguo si existe
  SELECT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'refresh_quotes_mvs'
  ) INTO v_exists;
  
  IF v_exists THEN
    PERFORM cron.unschedule('refresh_quotes_mvs');
  END IF;

  -- Crear nuevo job que incluye facturas
  SELECT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'refresh_analytics_mvs'
  ) INTO v_exists;

  IF NOT v_exists THEN
    PERFORM cron.schedule('refresh_analytics_mvs', '*/10 * * * *', 'CALL public.refresh_analytics_materialized_views();');
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- pg_cron no está instalado, ignorar
  NULL;
END $$;

-- ========== 8) POBLACIÓN INICIAL ==========
-- Ejecutar manualmente tras crear la MV:
-- REFRESH MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly;

-- ========== FIN ANALYTICS FACTURAS ==========
COMMENT ON VIEW analytics.invoice_base IS 'Vista base de facturas para analytics con cálculos de estado de cobro';
COMMENT ON MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly IS 'KPIs mensuales de facturación agregados por empresa y usuario';
COMMENT ON FUNCTION public.f_invoice_kpis_monthly(date, date) IS 'Retorna KPIs mensuales de facturas con filtros de seguridad';
COMMENT ON FUNCTION public.f_invoice_collection_status(date, date) IS 'Retorna estado de cobro agregado para el período especificado';
