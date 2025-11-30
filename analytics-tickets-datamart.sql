-- ========= ANALYTICS DATA MART - TICKETS ==========
-- Complemento al datamart para métricas de gestión de tickets (SAT)
-- Compatible con RLS/GDPR; usa JWT custom claims para company_id
-- Usa ticket_stages.workflow_category para determinar estado
-- Fecha: 2025-11-30

-- ========= LIMPIEZA PREVIA ==========
DROP MATERIALIZED VIEW IF EXISTS analytics.mv_ticket_kpis_monthly CASCADE;
DROP VIEW IF EXISTS analytics.ticket_base CASCADE;
DROP FUNCTION IF EXISTS public.f_ticket_kpis_monthly(date, date);
DROP FUNCTION IF EXISTS public.f_ticket_current_status();

-- ========= 1) Columnas físicas necesarias (si no existen) =======
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ticket_month date;

-- Poblar ticket_month para registros existentes
UPDATE public.tickets
SET ticket_month = DATE_TRUNC('month', created_at)::date
WHERE ticket_month IS NULL;

CREATE OR REPLACE FUNCTION public.set_ticket_month() RETURNS TRIGGER AS $$
BEGIN
  NEW.ticket_month := DATE_TRUNC('month', NEW.created_at)::date;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_ticket_month ON public.tickets;
CREATE TRIGGER trg_set_ticket_month
BEFORE INSERT OR UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.set_ticket_month();

-- ========== 2) ÍNDICES OPTIMIZADOS ==========
CREATE INDEX IF NOT EXISTS ix_tickets_company_month
  ON public.tickets (company_id, ticket_month);
CREATE INDEX IF NOT EXISTS ix_tickets_due_date
  ON public.tickets (due_date);
CREATE INDEX IF NOT EXISTS ix_tickets_stage_id
  ON public.tickets (stage_id);

-- ========== 3) VISTA BASE DE TICKETS ==========
-- Usa ticket_stages.workflow_category para determinar estado:
-- 'waiting' = abierto, 'analysis'/'action' = en progreso, 'final'/'cancel' = completado
-- NOTA: tickets no tiene created_by, se filtra solo por company_id
CREATE OR REPLACE VIEW analytics.ticket_base AS
SELECT
  t.id AS ticket_id,
  t.company_id::uuid AS company_id,
  t.client_id AS client_id,
  t.stage_id AS stage_id,
  t.priority AS priority,
  ts.workflow_category AS workflow_category,
  ts.stage_category AS stage_category,
  t.ticket_number AS ticket_number,
  t.title AS title,
  COALESCE(t.total_amount, 0)::numeric AS total_amount,
  t.created_at AS created_at,
  t.updated_at AS updated_at,
  t.due_date AS due_date,
  t.ticket_month AS period_month,
  -- Determinar si está completado (final o cancelado)
  (COALESCE(ts.workflow_category IN ('final', 'cancel'), ts.stage_category = 'completed')) AS is_completed,
  -- Calcular si está vencido (no completado y pasada fecha límite)
  (t.due_date IS NOT NULL 
   AND t.due_date < CURRENT_TIMESTAMP 
   AND NOT COALESCE(ts.workflow_category IN ('final', 'cancel'), ts.stage_category = 'completed')) AS is_overdue,
  -- Días hasta vencimiento o días vencido
  (CASE 
    WHEN COALESCE(ts.workflow_category IN ('final', 'cancel'), ts.stage_category = 'completed') THEN 0
    WHEN t.due_date IS NULL THEN NULL
    WHEN t.due_date::date < CURRENT_DATE THEN -(CURRENT_DATE - t.due_date::date)
    ELSE (t.due_date::date - CURRENT_DATE)
  END)::integer AS days_to_due,
  -- Tiempo de resolución en días (si está completado, usar updated_at como fecha de cierre)
  (CASE 
    WHEN COALESCE(ts.workflow_category IN ('final', 'cancel'), ts.stage_category = 'completed')
    THEN EXTRACT(EPOCH FROM (t.updated_at - t.created_at)) / 86400.0
    ELSE NULL
  END)::numeric AS resolution_days
FROM public.tickets t
LEFT JOIN public.ticket_stages ts ON t.stage_id = ts.id
WHERE t.deleted_at IS NULL;

-- ========== 4) MATERIALIZED VIEW: KPIs Mensuales de Tickets ==========
-- Agrupado solo por company_id y period_month (sin created_by)
CREATE MATERIALIZED VIEW analytics.mv_ticket_kpis_monthly AS
SELECT
  tb.company_id,
  tb.period_month,
  -- Conteos de creación
  COUNT(*) AS tickets_created,
  COUNT(*) FILTER (WHERE tb.priority = 'critical' OR tb.priority = 'urgent') AS critical_count,
  COUNT(*) FILTER (WHERE tb.priority = 'high') AS high_priority_count,
  COUNT(*) FILTER (WHERE tb.priority = 'normal') AS normal_priority_count,
  COUNT(*) FILTER (WHERE tb.priority = 'low') AS low_priority_count,
  -- Conteos por estado (usando workflow_category)
  COUNT(*) FILTER (WHERE tb.workflow_category = 'waiting' 
    OR (tb.workflow_category IS NULL AND tb.stage_category = 'open')) AS open_count,
  COUNT(*) FILTER (WHERE tb.workflow_category IN ('analysis', 'action')
    OR (tb.workflow_category IS NULL AND tb.stage_category = 'in_progress')) AS in_progress_count,
  COUNT(*) FILTER (WHERE tb.is_completed) AS completed_count,
  -- Tickets completados este mes (por fecha de actualización cuando está completado)
  COUNT(*) FILTER (WHERE tb.is_completed 
    AND DATE_TRUNC('month', tb.updated_at)::date = tb.period_month) AS completed_this_month,
  -- Tickets vencidos
  COUNT(*) FILTER (WHERE tb.is_overdue) AS overdue_count,
  -- Facturación
  SUM(tb.total_amount) AS total_amount_sum,
  SUM(tb.total_amount) FILTER (WHERE tb.is_completed) AS invoiced_amount_sum,
  -- Métricas de tiempo de resolución
  AVG(tb.resolution_days) FILTER (WHERE tb.resolution_days IS NOT NULL)::numeric AS avg_resolution_days,
  MIN(tb.resolution_days) FILTER (WHERE tb.resolution_days IS NOT NULL)::numeric AS min_resolution_days,
  MAX(tb.resolution_days) FILTER (WHERE tb.resolution_days IS NOT NULL)::numeric AS max_resolution_days,
  -- Tasa de resolución
  (COUNT(*) FILTER (WHERE tb.is_completed)::numeric / 
   NULLIF(COUNT(*)::numeric, 0)) AS resolution_rate
FROM analytics.ticket_base tb
GROUP BY tb.company_id, tb.period_month
WITH NO DATA;

CREATE UNIQUE INDEX ux_mv_ticket_kpis_monthly
  ON analytics.mv_ticket_kpis_monthly (company_id, period_month);

-- ========== 5) SEGURIDAD: Restringir acceso directo a MVs ==========
REVOKE ALL ON TABLE analytics.mv_ticket_kpis_monthly FROM PUBLIC;

-- ========== 6) FUNCIONES RPC SEGURAS ==========

-- 6.1) KPIs mensuales de tickets (filtrado solo por company_id)
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
  SELECT m.company_id, m.period_month,
         m.tickets_created, m.critical_count, m.high_priority_count, 
         m.normal_priority_count, m.low_priority_count,
         m.open_count, m.in_progress_count, m.completed_count, m.completed_this_month, m.overdue_count,
         m.total_amount_sum, m.invoiced_amount_sum,
         m.avg_resolution_days, m.min_resolution_days, m.max_resolution_days,
         m.resolution_rate
  FROM analytics.mv_ticket_kpis_monthly m
  WHERE m.company_id = public.get_user_company_id()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;
GRANT EXECUTE ON FUNCTION public.f_ticket_kpis_monthly(date, date) TO authenticated;

-- 6.2) Estado actual de tickets (tiempo real, sin MV, solo por company_id)
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
  WHERE tb.company_id = public.get_user_company_id()
  GROUP BY tb.company_id;
$$;
GRANT EXECUTE ON FUNCTION public.f_ticket_current_status() TO authenticated;

-- ========== 7) ACTUALIZAR PROCEDIMIENTO DE REFRESH ==========
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
  -- Tickets
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_ticket_kpis_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
END;
$$;
GRANT EXECUTE ON PROCEDURE public.refresh_analytics_materialized_views() TO authenticated;

-- ========== 8) POBLACIÓN INICIAL ==========
-- Ejecutar manualmente tras crear la MV:
-- REFRESH MATERIALIZED VIEW analytics.mv_ticket_kpis_monthly;

-- ========== FIN ANALYTICS TICKETS ==========
COMMENT ON VIEW analytics.ticket_base IS 'Vista base de tickets para analytics con cálculos de tiempos y estados';
COMMENT ON MATERIALIZED VIEW analytics.mv_ticket_kpis_monthly IS 'KPIs mensuales de tickets agregados por empresa y usuario';
COMMENT ON FUNCTION public.f_ticket_kpis_monthly(date, date) IS 'Retorna KPIs mensuales de tickets con filtros de seguridad';
COMMENT ON FUNCTION public.f_ticket_current_status() IS 'Retorna estado actual de tickets en tiempo real';
