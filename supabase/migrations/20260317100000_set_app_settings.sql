-- Schema privado para datos internos no expuestos por PostgREST
CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA internal TO postgres, service_role;

-- Tabla de configuración interna para secrets usados por funciones SQL (pg_cron).
-- Solo accesible por service_role y postgres. Los usuarios autenticados NO pueden leerla.
CREATE TABLE IF NOT EXISTS internal.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE internal.app_config ENABLE ROW LEVEL SECURITY;

-- Ningún usuario autenticado puede leer esta tabla
CREATE POLICY "no_access" ON internal.app_config
  AS RESTRICTIVE FOR ALL
  USING (false);

GRANT SELECT ON internal.app_config TO postgres;

-- Reemplaza la función para que use esta tabla en vez de current_setting
CREATE OR REPLACE FUNCTION public.invoke_process_recurring_quotes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  v_url        text := 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
  v_service_key text;
BEGIN
  SELECT value INTO v_service_key
  FROM internal.app_config
  WHERE key = 'service_role_key';

  IF v_service_key IS NULL THEN
    RAISE WARNING 'invoke_process_recurring_quotes: service_role_key not set in internal.app_config';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/process-recurring-quotes',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := '{}'::jsonb
  );

  RAISE NOTICE 'Invoked process-recurring-quotes at %', NOW();
END;
$$;

COMMENT ON FUNCTION public.invoke_process_recurring_quotes() IS
  'Invoca la Edge Function process-recurring-quotes para generar facturas de presupuestos recurrentes. Se ejecuta diariamente a las 00:05 UTC via pg_cron.';
