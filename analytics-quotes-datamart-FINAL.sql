-- ========= ANALYTICS DATA MART - VERSIÓN FINAL ==========
-- Incluye: columna física quote_month, índices optimizados, MVs, y funciones RPC completas
-- Compatible con RLS/GDPR; usa JWT custom claims para company_id

-- ========= LIMPIEZA PREVIA ==========
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_quote_kpis_monthly CASCADE;
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_quote_top_items_monthly CASCADE;
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_quote_cube CASCADE;
DROP VIEW IF EXISTS analytics.quote_base CASCADE;
DROP VIEW IF EXISTS analytics.quote_item_base CASCADE;
DROP FUNCTION IF EXISTS public.f_quote_projected_revenue(date, date);
DROP FUNCTION IF EXISTS public.f_quote_kpis_monthly(date, date);
DROP FUNCTION IF EXISTS public.f_quote_top_items_monthly(date, date, int);
DROP FUNCTION IF EXISTS public.f_quote_cube(date, date);
DROP FUNCTION IF EXISTS public.refresh_quotes_materialized_views();

-- ========= 0) SCHEMA ANALYTICS ==========
CREATE SCHEMA IF NOT EXISTS analytics;

-- ========= 1) Columna física de mes y triggers =======
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS quote_month date;

UPDATE public.quotes
SET quote_month = DATE_TRUNC('month', COALESCE(quote_date, created_at))::date
WHERE quote_month IS NULL;

CREATE OR REPLACE FUNCTION public.set_quote_month() RETURNS TRIGGER AS $$
BEGIN
  NEW.quote_month := DATE_TRUNC('month', COALESCE(NEW.quote_date, NEW.created_at))::date;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_quote_month ON public.quotes;
CREATE TRIGGER trg_set_quote_month
BEFORE INSERT OR UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.set_quote_month();

-- ========== 2) ÍNDICES SOLO EN COLUMNAS FÍSICAS ==========
CREATE INDEX IF NOT EXISTS ix_quotes_company_created_month
  ON public.quotes (company_id, created_by, quote_month);
CREATE INDEX IF NOT EXISTS ix_quote_items_quote_id ON public.quote_items (quote_id);

-- ========== 3) VISTAS BASE ==========
CREATE OR REPLACE VIEW analytics.quote_base AS
SELECT
  q.id AS quote_id,
  q.company_id AS company_id,
  q.created_by AS created_by,
  COALESCE(q.subtotal, 0)::numeric AS subtotal,
  COALESCE(q.tax_amount, 0)::numeric AS tax_amount,
  COALESCE(q.total_amount, 0)::numeric AS total_amount,
  q.status AS status,
  q.conversion_status AS conversion_status,
  (CASE WHEN q.quote_date IS NOT NULL THEN q.quote_date::timestamp ELSE q.created_at END) AS quote_ts,
  q.quote_month AS period_month,
  ((CASE WHEN q.accepted_at IS NOT NULL THEN DATE_PART('day', q.accepted_at - COALESCE(q.quote_date, q.created_at)) END))::integer AS days_to_accept
FROM public.quotes q;

CREATE OR REPLACE VIEW analytics.quote_item_base AS
SELECT
  qi.id AS quote_item_id,
  qi.quote_id AS quote_id,
  q.company_id AS company_id,
  q.created_by AS created_by,
  COALESCE(qi.service_id, qi.product_id, qi.variant_id) AS item_id,
  COALESCE(qi.quantity, 0)::numeric AS quantity,
  COALESCE(qi.subtotal, 0)::numeric AS subtotal,
  COALESCE(qi.tax_amount, 0)::numeric AS tax_amount,
  COALESCE(qi.total, 0)::numeric AS total_amount,
  q.quote_month AS period_month
FROM public.quote_items qi
JOIN public.quotes q ON q.id = qi.quote_id;

-- ========== 4) MATERIALIZED VIEWS ==========
CREATE MATERIALIZED VIEW analytics.mv_quote_kpis_monthly AS
SELECT
  qb.company_id,
  qb.created_by,
  qb.period_month,
  COUNT(*) AS quotes_count,
  SUM(qb.subtotal) AS subtotal_sum,
  SUM(qb.tax_amount) AS tax_sum,
  SUM(qb.total_amount) AS total_sum,
  AVG(qb.days_to_accept)::numeric AS avg_days_to_accept,
  (SUM(CASE WHEN qb.conversion_status = 'accepted' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0)) AS conversion_rate
FROM analytics.quote_base qb
GROUP BY qb.company_id, qb.created_by, qb.period_month
WITH NO DATA;

CREATE UNIQUE INDEX ux_mv_quote_kpis_monthly
  ON analytics.mv_quote_kpis_monthly (company_id, created_by, period_month);

CREATE MATERIALIZED VIEW analytics.mv_quote_top_items_monthly AS
WITH agg AS (
  SELECT
    qib.company_id,
    qib.created_by,
    qib.period_month,
    qib.item_id,
    SUM(qib.quantity) AS qty_sum,
    SUM(qib.subtotal) AS subtotal_sum,
    SUM(qib.total_amount) AS total_sum
  FROM analytics.quote_item_base qib
  GROUP BY qib.company_id, qib.created_by, qib.period_month, qib.item_id
)
SELECT
  a.*,
  ROW_NUMBER() OVER (PARTITION BY a.company_id, a.created_by, a.period_month ORDER BY a.total_sum DESC) AS rn_by_amount,
  ROW_NUMBER() OVER (PARTITION BY a.company_id, a.created_by, a.period_month ORDER BY a.qty_sum DESC) AS rn_by_qty
FROM agg a
WITH NO DATA;

CREATE UNIQUE INDEX ux_mv_quote_top_items_monthly
  ON analytics.mv_quote_top_items_monthly (company_id, created_by, period_month, item_id);

CREATE MATERIALIZED VIEW analytics.mv_quote_cube AS
SELECT
  qb.company_id,
  qb.created_by,
  qb.period_month,
  qb.status,
  qb.conversion_status,
  ((GROUPING(qb.company_id)::int << 4)
    + (GROUPING(qb.created_by)::int << 3)
    + (GROUPING(qb.period_month)::int << 2)
    + (GROUPING(qb.status)::int << 1)
    + (GROUPING(qb.conversion_status)::int)) AS group_id,
  COUNT(*) AS quotes_count,
  SUM(qb.subtotal) AS subtotal_sum,
  SUM(qb.tax_amount) AS tax_sum,
  SUM(qb.total_amount) AS total_sum
FROM analytics.quote_base qb
GROUP BY CUBE (qb.company_id, qb.created_by, qb.period_month, qb.status, qb.conversion_status)
WITH NO DATA;

CREATE UNIQUE INDEX ux_mv_quote_cube
  ON analytics.mv_quote_cube (company_id, created_by, period_month, status, conversion_status, group_id);

-- ========== 5) SEGURIDAD: Restringir acceso directo a MVs ==========
REVOKE ALL ON TABLE analytics.mv_quote_kpis_monthly FROM PUBLIC;
REVOKE ALL ON TABLE analytics.mv_quote_top_items_monthly FROM PUBLIC;
REVOKE ALL ON TABLE analytics.mv_quote_cube FROM PUBLIC;

-- ========== 6) FUNCIÓN HELPER: Obtener company_id del JWT ==========
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
DECLARE
  jwt jsonb;
  cid text;
BEGIN
  jwt := COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb);
  cid := NULLIF((jwt ->> 'company_id'), '');
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Missing company_id in JWT claims'
      USING HINT = 'Ensure Auth Hook is configured and user has logged in after activation';
  END IF;
  RETURN cid::uuid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_user_company_id() TO authenticated;

-- ========== 7) FUNCIONES RPC SEGURAS ==========

-- 7.1) KPIs mensuales
CREATE OR REPLACE FUNCTION public.f_quote_kpis_monthly(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  created_by uuid,
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
  SELECT m.company_id, m.created_by, m.period_month,
         m.quotes_count, m.subtotal_sum, m.tax_sum, m.total_sum,
         m.avg_days_to_accept, m.conversion_rate
  FROM analytics.mv_quote_kpis_monthly m
  WHERE m.company_id = public.get_user_company_id()
    AND m.created_by = auth.uid()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;
GRANT EXECUTE ON FUNCTION public.f_quote_kpis_monthly(date, date) TO authenticated;

-- 7.2) Ingresos proyectados (borradores)
CREATE OR REPLACE FUNCTION public.f_quote_projected_revenue(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  created_by uuid,
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
    qb.company_id,
    qb.created_by,
    qb.period_month,
    COUNT(*) AS draft_count,
    SUM(qb.subtotal) AS subtotal,
    SUM(qb.tax_amount) AS tax_amount,
    SUM(qb.total_amount) AS grand_total
  FROM analytics.quote_base qb
  WHERE qb.company_id = public.get_user_company_id()
    AND qb.created_by = auth.uid()
    AND qb.status = 'draft'
    AND (p_start IS NULL OR qb.period_month >= p_start)
    AND (p_end IS NULL OR qb.period_month <= p_end)
  GROUP BY qb.company_id, qb.created_by, qb.period_month
  ORDER BY period_month DESC;
$$;
GRANT EXECUTE ON FUNCTION public.f_quote_projected_revenue(date, date) TO authenticated;

-- 7.3) Top items mensuales
CREATE OR REPLACE FUNCTION public.f_quote_top_items_monthly(p_start date DEFAULT NULL, p_end date DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE (
  company_id uuid,
  created_by uuid,
  period_month date,
  item_id uuid,
  qty_sum numeric,
  subtotal_sum numeric,
  total_sum numeric,
  rn_by_amount bigint,
  rn_by_qty bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
  SELECT t.company_id, t.created_by, t.period_month, t.item_id,
         t.qty_sum, t.subtotal_sum, t.total_sum, t.rn_by_amount, t.rn_by_qty
  FROM analytics.mv_quote_top_items_monthly t
  WHERE t.company_id = public.get_user_company_id()
    AND t.created_by = auth.uid()
    AND (p_start IS NULL OR t.period_month >= p_start)
    AND (p_end   IS NULL OR t.period_month <= p_end)
    AND (t.rn_by_amount <= p_limit OR t.rn_by_qty <= p_limit)
  ORDER BY t.period_month DESC, t.total_sum DESC;
$$;
GRANT EXECUTE ON FUNCTION public.f_quote_top_items_monthly(date, date, int) TO authenticated;

-- 7.4) Cubo multidimensional
CREATE OR REPLACE FUNCTION public.f_quote_cube(p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS TABLE (
  company_id uuid,
  created_by uuid,
  period_month date,
  status text,
  conversion_status text,
  group_id integer,
  quotes_count bigint,
  subtotal_sum numeric,
  tax_sum numeric,
  total_sum numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, analytics
AS $$
  SELECT c.company_id, c.created_by, c.period_month, c.status, c.conversion_status, c.group_id,
         c.quotes_count, c.subtotal_sum, c.tax_sum, c.total_sum
  FROM analytics.mv_quote_cube c
  WHERE c.company_id = public.get_user_company_id()
    AND c.created_by = auth.uid()
    AND (p_start IS NULL OR c.period_month >= p_start)
    AND (p_end   IS NULL OR c.period_month <= p_end)
  ORDER BY c.period_month NULLS LAST, c.status NULLS LAST, c.conversion_status NULLS LAST;
$$;
GRANT EXECUTE ON FUNCTION public.f_quote_cube(date, date) TO authenticated;

-- ========== 8) PROCEDIMIENTO DE REFRESH ==========
CREATE OR REPLACE PROCEDURE public.refresh_quotes_materialized_views()
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, analytics
AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_kpis_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_top_items_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_cube;
  EXCEPTION WHEN undefined_table THEN NULL; END;
END;
$$;
GRANT EXECUTE ON PROCEDURE public.refresh_quotes_materialized_views() TO authenticated;

-- ========== 9) PG_CRON: Refresh automático cada 10 minutos ==========
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'refresh_quotes_mvs'
  ) INTO v_exists;

  IF NOT v_exists THEN
    PERFORM cron.schedule('refresh_quotes_mvs', '*/10 * * * *', 'CALL public.refresh_quotes_materialized_views();');
  END IF;
END $$;

-- ========== 10) POBLACIÓN INICIAL DE MVs ==========
-- Ejecutar manualmente tras crear las MVs:
-- REFRESH MATERIALIZED VIEW analytics.mv_quote_kpis_monthly;
-- REFRESH MATERIALIZED VIEW analytics.mv_quote_top_items_monthly;
-- REFRESH MATERIALIZED VIEW analytics.mv_quote_cube;

-- ========== FIN ANALYTICS DATA MART ==========
COMMENT ON SCHEMA analytics IS 'Schema para vistas materializadas y funciones de analíticas de presupuestos';
COMMENT ON FUNCTION public.get_user_company_id() IS 'Extrae company_id del JWT custom claim (Auth Hook)';
COMMENT ON FUNCTION public.f_quote_kpis_monthly(date, date) IS 'Retorna KPIs mensuales de presupuestos con filtros de seguridad';
COMMENT ON FUNCTION public.f_quote_projected_revenue(date, date) IS 'Retorna ingresos proyectados de borradores con filtros de seguridad';
