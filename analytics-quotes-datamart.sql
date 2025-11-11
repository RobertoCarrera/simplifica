-- Analytics Data Mart for Quotes (Supabase/Postgres)
-- Idempotent setup: schema, base views (no PII), materialized views, indexes, SECURE functions, and pg_cron refresh.
-- Compatible with RLS/GDPR; no changes to fiscal/Verifactu pipeline.

-- 0) Safety: Create dedicated schema
CREATE SCHEMA IF NOT EXISTS analytics;

-- 1) Base views (no PII). These DO NOT enforce auth filters directly; access is via SECURE functions below.
--    Columns assumed on source tables; adjust if your schema differs.
--    public.quotes: id (uuid), company_id (uuid), created_by (uuid), status (text), conversion_status (text),
--                   subtotal (numeric), tax_amount (numeric), total_amount (numeric),
--                   quote_date (timestamp/date), created_at (timestamp), accepted_at (timestamp/null)
--    public.quote_items: id (uuid), quote_id (uuid), item_id (uuid), quantity (numeric), unit_price (numeric),
--                        subtotal (numeric), tax_amount (numeric), total_amount (or total) (numeric)

CREATE OR REPLACE VIEW analytics.quote_base AS
SELECT
  q.id                AS quote_id,
  q.company_id        AS company_id,
  q.created_by        AS created_by,
  COALESCE(q.subtotal, 0)::numeric       AS subtotal,
  COALESCE(q.tax_amount, 0)::numeric     AS tax_amount,
  COALESCE(q.total_amount, 0)::numeric   AS total_amount,
  q.status            AS status,
  q.conversion_status AS conversion_status,
  (CASE
     WHEN q.quote_date IS NOT NULL THEN q.quote_date::timestamp
     ELSE q.created_at
   END)                                AS quote_ts,
  ((CASE WHEN q.accepted_at IS NOT NULL THEN DATE_PART('day', q.accepted_at - COALESCE(q.quote_date, q.created_at)) END))::integer AS days_to_accept
FROM public.quotes q;

CREATE OR REPLACE VIEW analytics.quote_item_base AS
SELECT
  qi.id          AS quote_item_id,
  qi.quote_id    AS quote_id,
  q.company_id   AS company_id,
  q.created_by   AS created_by,
  qi.item_id     AS item_id,
  COALESCE(qi.quantity, 0)::numeric      AS quantity,
  COALESCE(qi.subtotal, 0)::numeric      AS subtotal,
  COALESCE(qi.tax_amount, 0)::numeric    AS tax_amount,
  COALESCE(qi.total_amount, 0)::numeric  AS total_amount,
  -- quote month precomputed for convenience in MVs
  DATE_TRUNC('month', (CASE WHEN q.quote_date IS NOT NULL THEN q.quote_date::timestamp ELSE q.created_at END))::date AS period_month
FROM public.quote_items qi
JOIN public.quotes q ON q.id = qi.quote_id;

-- 2) Materialized Views
-- 2.1) Monthly KPIs per company/user
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_quote_kpis_monthly AS
SELECT
  qb.company_id,
  qb.created_by,
  DATE_TRUNC('month', qb.quote_ts)::date AS period_month,
  COUNT(*)                                AS quotes_count,
  SUM(qb.subtotal)                        AS subtotal_sum,
  SUM(qb.tax_amount)                      AS tax_sum,
  SUM(qb.total_amount)                    AS total_sum,
  AVG(qb.days_to_accept)::numeric         AS avg_days_to_accept,
  (SUM(CASE WHEN qb.conversion_status = 'accepted' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0)) AS conversion_rate
FROM analytics.quote_base qb
GROUP BY qb.company_id, qb.created_by, DATE_TRUNC('month', qb.quote_ts)
WITH NO DATA;

-- Unique index required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_quote_kpis_monthly
  ON analytics.mv_quote_kpis_monthly (company_id, created_by, period_month);

-- 2.2) Monthly Top Items per company/user
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_quote_top_items_monthly AS
WITH agg AS (
  SELECT
    qib.company_id,
    qib.created_by,
    qib.period_month,
    qib.item_id,
    SUM(qib.quantity)     AS qty_sum,
    SUM(qib.subtotal)     AS subtotal_sum,
    SUM(qib.total_amount) AS total_sum
  FROM analytics.quote_item_base qib
  GROUP BY qib.company_id, qib.created_by, qib.period_month, qib.item_id
)
SELECT
  a.*,
  ROW_NUMBER() OVER (PARTITION BY a.company_id, a.created_by, a.period_month ORDER BY a.total_sum DESC) AS rn_by_amount,
  ROW_NUMBER() OVER (PARTITION BY a.company_id, a.created_by, a.period_month ORDER BY a.qty_sum DESC)    AS rn_by_qty
FROM agg a
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_quote_top_items_monthly
  ON analytics.mv_quote_top_items_monthly (company_id, created_by, period_month, item_id);

-- 2.3) Multidimensional cube (company, user, month, status, conversion_status)
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.mv_quote_cube AS
SELECT
  qb.company_id,
  qb.created_by,
  (DATE_TRUNC('month', qb.quote_ts)::date) AS period_month,
  qb.status,
  qb.conversion_status,
  GROUPING_ID(qb.company_id, qb.created_by, DATE_TRUNC('month', qb.quote_ts), qb.status, qb.conversion_status) AS group_id,
  COUNT(*)                                AS quotes_count,
  SUM(qb.subtotal)                        AS subtotal_sum,
  SUM(qb.tax_amount)                      AS tax_sum,
  SUM(qb.total_amount)                    AS total_sum
FROM analytics.quote_base qb
GROUP BY CUBE (qb.company_id, qb.created_by, DATE_TRUNC('month', qb.quote_ts), qb.status, qb.conversion_status)
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_quote_cube
  ON analytics.mv_quote_cube (company_id, created_by, period_month, status, conversion_status, group_id);

-- 3) Security: Restrict direct access; allow only via functions
REVOKE ALL ON TABLE analytics.mv_quote_kpis_monthly FROM PUBLIC;
REVOKE ALL ON TABLE analytics.mv_quote_top_items_monthly FROM PUBLIC;
REVOKE ALL ON TABLE analytics.mv_quote_cube FROM PUBLIC;

-- 4) Helper to obtain context (company_id) securely
--    We prefer to read company_id from JWT custom claim 'company_id'.
--    If the claim is not present, raise an explicit error.
CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, analytics
AS $$
DECLARE
  jwt jsonb;
  cid text;
BEGIN
  jwt := COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb);
  cid := NULLIF((jwt ->> 'company_id'), '');
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Missing company_id in JWT claims';
  END IF;
  RETURN cid::uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_company_id() TO authenticated;

-- 5) SECURE API functions to expose analytics (filtering by company_id and created_by = auth.uid())

-- 5.1) KPIs monthly
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

-- 5.2) Projected revenue from draft quotes
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
SET search_path = public, analytics
AS $$
  SELECT 
    qb.company_id,
    qb.created_by,
    DATE_TRUNC('month', qb.quote_ts)::date AS period_month,
    COUNT(*) AS draft_count,
    SUM(qb.subtotal) AS subtotal,
    SUM(qb.tax_amount) AS tax_amount,
    SUM(qb.total_amount) AS grand_total
  FROM analytics.quote_base qb
  WHERE qb.company_id = public.get_user_company_id()
    AND qb.created_by = auth.uid()
    AND qb.status = 'draft'
    AND (p_start IS NULL OR DATE_TRUNC('month', qb.quote_ts)::date >= p_start)
    AND (p_end IS NULL OR DATE_TRUNC('month', qb.quote_ts)::date <= p_end)
  GROUP BY qb.company_id, qb.created_by, DATE_TRUNC('month', qb.quote_ts)
  ORDER BY period_month DESC;
$$;

GRANT EXECUTE ON FUNCTION public.f_quote_projected_revenue(date, date) TO authenticated;

-- 5.3) Top items monthly (limit applies to both rankings)
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

-- 5.4) Cube access
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

-- 6) pg_cron: periodic refresh every 10 minutes
--    Ensure extension exists (Supabase provides pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE PROCEDURE public.refresh_quotes_materialized_views()
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, analytics
AS $$
BEGIN
  -- Use EXCEPTION blocks to ignore initial absence
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

-- Schedule or ensure a job exists named 'refresh_quotes_mvs' every 10 minutes
DO $$
DECLARE
  v_exists boolean;
BEGIN
  -- pg_cron >= 1.5 supports named jobs via cron.schedule(jobname, schedule, command)
  SELECT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'refresh_quotes_mvs'
  ) INTO v_exists;

  IF NOT v_exists THEN
    PERFORM cron.schedule('refresh_quotes_mvs', '*/10 * * * *', $$CALL public.refresh_quotes_materialized_views()$$);
  END IF;
END $$;

-- 7) Helpful indexes on base tables (non-invasive; create if missing). Adjust to your naming if needed.
CREATE INDEX IF NOT EXISTS ix_quotes_company_created_ts ON public.quotes (company_id, created_by, (DATE_TRUNC('month', COALESCE(quote_date::timestamp, created_at))));
CREATE INDEX IF NOT EXISTS ix_quote_items_quote_id ON public.quote_items (quote_id);

-- NOTE: If your quotes table uses column names 'total' instead of 'total_amount' (or 'tax' instead of 'tax_amount'),
-- adjust the SELECT lists above accordingly. Current script assumes: subtotal, tax_amount, total_amount.

-- End of analytics data mart setup
