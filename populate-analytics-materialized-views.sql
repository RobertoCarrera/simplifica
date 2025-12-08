-- ============================================================
-- Script para poblar las vistas materializadas de analytics
-- ============================================================
-- Este script debe ejecutarse después de crear las vistas materializadas
-- para poblarlas con datos iniciales.
--
-- Ejecutar con: psql -d <database> -f populate-analytics-materialized-views.sql
-- O desde Supabase SQL Editor
-- ============================================================

-- 1. Poblar vista materializada de KPIs mensuales de facturas
DO $$
BEGIN
  RAISE NOTICE 'Poblando mv_invoice_kpis_monthly...';
  
  -- Verificar si la vista existe
  IF EXISTS (
    SELECT 1 
    FROM pg_matviews 
    WHERE schemaname = 'analytics' 
    AND matviewname = 'mv_invoice_kpis_monthly'
  ) THEN
    -- Poblar la vista materializada
    REFRESH MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly;
    RAISE NOTICE '✓ mv_invoice_kpis_monthly poblada correctamente';
  ELSE
    RAISE WARNING '✗ La vista mv_invoice_kpis_monthly no existe. Debe crearla primero.';
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '✗ Error al poblar mv_invoice_kpis_monthly: %', SQLERRM;
END;
$$;

-- 2. Poblar vista materializada de KPIs mensuales de tickets
DO $$
BEGIN
  RAISE NOTICE 'Poblando mv_ticket_kpis_monthly...';
  
  -- Verificar si la vista existe
  IF EXISTS (
    SELECT 1 
    FROM pg_matviews 
    WHERE schemaname = 'analytics' 
    AND matviewname = 'mv_ticket_kpis_monthly'
  ) THEN
    -- Poblar la vista materializada
    REFRESH MATERIALIZED VIEW analytics.mv_ticket_kpis_monthly;
    RAISE NOTICE '✓ mv_ticket_kpis_monthly poblada correctamente';
  ELSE
    RAISE WARNING '✗ La vista mv_ticket_kpis_monthly no existe. Debe crearla primero.';
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '✗ Error al poblar mv_ticket_kpis_monthly: %', SQLERRM;
END;
$$;

-- 3. Verificar el estado de las vistas materializadas
DO $$
DECLARE
  v_invoice_populated boolean;
  v_ticket_populated boolean;
  v_invoice_rows bigint;
  v_ticket_rows bigint;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Estado de vistas materializadas';
  RAISE NOTICE '========================================';
  
  -- Verificar mv_invoice_kpis_monthly
  SELECT ispopulated INTO v_invoice_populated
  FROM pg_matviews 
  WHERE schemaname = 'analytics' 
  AND matviewname = 'mv_invoice_kpis_monthly';
  
  IF v_invoice_populated IS NOT NULL THEN
    IF v_invoice_populated THEN
      SELECT COUNT(*) INTO v_invoice_rows
      FROM analytics.mv_invoice_kpis_monthly;
      
      RAISE NOTICE 'mv_invoice_kpis_monthly: ✓ Poblada (% filas)', v_invoice_rows;
    ELSE
      RAISE NOTICE 'mv_invoice_kpis_monthly: ✗ NO poblada';
    END IF;
  ELSE
    RAISE NOTICE 'mv_invoice_kpis_monthly: ✗ No existe';
  END IF;
  
  -- Verificar mv_ticket_kpis_monthly
  SELECT ispopulated INTO v_ticket_populated
  FROM pg_matviews 
  WHERE schemaname = 'analytics' 
  AND matviewname = 'mv_ticket_kpis_monthly';
  
  IF v_ticket_populated IS NOT NULL THEN
    IF v_ticket_populated THEN
      SELECT COUNT(*) INTO v_ticket_rows
      FROM analytics.mv_ticket_kpis_monthly;
      
      RAISE NOTICE 'mv_ticket_kpis_monthly: ✓ Poblada (% filas)', v_ticket_rows;
    ELSE
      RAISE NOTICE 'mv_ticket_kpis_monthly: ✗ NO poblada';
    END IF;
  ELSE
    RAISE NOTICE 'mv_ticket_kpis_monthly: ✗ No existe';
  END IF;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END;
$$;

-- 4. Información adicional sobre la última actualización
SELECT 
  schemaname,
  matviewname as vista,
  ispopulated as poblada,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||matviewname)) as tamaño
FROM pg_matviews
WHERE schemaname = 'analytics'
  AND matviewname IN ('mv_invoice_kpis_monthly', 'mv_ticket_kpis_monthly')
ORDER BY matviewname;
