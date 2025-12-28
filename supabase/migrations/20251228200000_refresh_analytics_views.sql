-- Refresh materialized views to ensuring they are populated
-- Fixes 'materialized view "mv_ticket_kpis_monthly" has not been populated' error

DO $$
BEGIN
  -- Refresh Ticket KPIs Monthly
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'analytics' AND matviewname = 'mv_ticket_kpis_monthly') THEN
    REFRESH MATERIALIZED VIEW analytics.mv_ticket_kpis_monthly;
  END IF;

  -- Refresh Ticket KPIs Daily (if exists)
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'analytics' AND matviewname = 'mv_ticket_kpis_daily') THEN
    REFRESH MATERIALIZED VIEW analytics.mv_ticket_kpis_daily;
  END IF;

  -- Refresh Quote KPIs Monthly (if exists) - Good practice to keep them in sync
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'analytics' AND matviewname = 'mv_quote_kpis_monthly') THEN
    REFRESH MATERIALIZED VIEW analytics.mv_quote_kpis_monthly;
  END IF;
END $$;
