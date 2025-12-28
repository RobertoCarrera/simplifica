-- Refresh Analytics Views RPC
-- Created to allow on-demand refresh of materialized views for Dashboard Metrics

CREATE OR REPLACE FUNCTION "public"."f_refresh_analytics_views"() RETURNS void
LANGUAGE "plpgsql" SECURITY DEFINER
AS $$
BEGIN
  -- Refresh Ticket KPIs (Materialized Views)
  -- Use CONCURRENTLY to avoid locking table for reads
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'analytics' AND matviewname = 'mv_ticket_kpis_monthly') THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_ticket_kpis_monthly;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'analytics' AND matviewname = 'mv_ticket_kpis_daily') THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_ticket_kpis_daily;
  END IF;

  -- Refresh Invoice/Quote KPIs
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'analytics' AND matviewname = 'mv_invoice_kpis_monthly') THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_invoice_kpis_monthly;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'analytics' AND matviewname = 'mv_quote_kpis_monthly') THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_kpis_monthly;
  END IF;
   
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'analytics' AND matviewname = 'mv_quote_top_items_monthly') THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_top_items_monthly;
  END IF;
  
   IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'analytics' AND matviewname = 'mv_quote_cube') THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_cube;
  END IF;
END;
$$;

ALTER FUNCTION "public"."f_refresh_analytics_views"() OWNER TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."f_refresh_analytics_views"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."f_refresh_analytics_views"() TO "service_role";
