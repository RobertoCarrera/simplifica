-- ============================================================
-- CONFIGURACIÓN: Cron Job para procesar presupuestos recurrentes
-- ============================================================
-- Este script configura un cron job que ejecuta diariamente
-- la Edge Function process-recurring-quotes
-- 
-- Ejecutar en el SQL Editor de Supabase Dashboard
-- ============================================================

-- Habilitar la extensión pg_cron si no está habilitada
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Crear la función que invoca la Edge Function
CREATE OR REPLACE FUNCTION public.invoke_process_recurring_quotes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
  v_service_key text;
BEGIN
  -- Obtener la URL base de Supabase
  -- Nota: En producción, estas deberían estar configuradas como secrets
  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);
  
  IF v_url IS NULL THEN
    v_url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
  END IF;

  -- Hacer la llamada HTTP a la Edge Function
  PERFORM net.http_post(
    url := v_url || '/functions/v1/process-recurring-quotes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := '{}'::jsonb
  );
  
  RAISE NOTICE 'Invoked process-recurring-quotes at %', NOW();
END;
$$;

-- Programar el cron job para ejecutarse diariamente a las 00:05 UTC
-- Esto asegura que se procesen los presupuestos cuyo next_run_at es "hoy"
SELECT cron.schedule(
  'process-recurring-quotes',           -- nombre del job
  '5 0 * * *',                          -- cron expression: 00:05 todos los días
  'SELECT public.invoke_process_recurring_quotes()'
);

-- Verificar que el job se creó
SELECT * FROM cron.job WHERE jobname = 'process-recurring-quotes';

-- ============================================================
-- ALTERNATIVA: Usar Supabase Edge Function Scheduler
-- ============================================================
-- Si prefieres usar el scheduler nativo de Supabase:
--
-- 1. Ve a Dashboard > Edge Functions > Schedules
-- 2. Crea un nuevo schedule:
--    - Function: process-recurring-quotes
--    - Schedule: 0 0 * * * (cada día a medianoche)
--    - o usa: every 1 day
--
-- Esto es más simple y no requiere pg_cron ni pg_net
-- ============================================================

COMMENT ON FUNCTION public.invoke_process_recurring_quotes() IS 
'Invoca la Edge Function process-recurring-quotes para generar facturas
de presupuestos recurrentes que están pendientes de facturar.
Se ejecuta diariamente a las 00:05 UTC via pg_cron.';
