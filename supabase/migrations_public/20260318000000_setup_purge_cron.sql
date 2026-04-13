-- ============================================================
-- FASE 5: PURGA AUTOMÁTICA Y Mantenimiento (Supabase PÚBLICO)
-- PROPÓSITO: Eliminar datos personales de la DMZ tras la sincronización
-- SEGURIDAD: Minimiza el tiempo de exposición de PII (Personally Identifiable Information)
-- ============================================================

-- 1. Habilitar la extensión pg_cron (Solo disponible en Supabase Pro/Self-hosted)
-- Nota: Si falla, asegúrate de que pg_cron esté habilitado en el Dashboard -> Database -> Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Crear función de purga de seguridad
CREATE OR REPLACE FUNCTION public.purge_synced_bookings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Ejecuta con privilegios de sistema para poder borrar
AS $$
BEGIN
    -- Borra registros que ya han sido sincronizados con éxito al sistema privado
    -- y llevan más de 1 hora en la DMZ (margen de seguridad).
    DELETE FROM public.public_bookings
    WHERE status = 'synced'
      AND synced_at < now() - interval '1 hour';

    -- Borra registros pendientes, cancelados o expirados que tengan más de 48h
    -- (Limpieza de basura de intentos fallidos o bots)
    DELETE FROM public.public_bookings
    WHERE status IN ('pending', 'cancelled', 'expired')
      AND created_at < now() - interval '2 days';
END;
$$;

-- 3. Programar la tarea diaria (Cada noche a las 03:00)
-- IMPORTANTE: El formato cron es 'minuto hora dia mes dia_semana'
SELECT cron.schedule(
    'nightly-booking-purge',  -- Nombre único del job
    '0 3 * * *',             -- Cron expression (03:00 AM)
    'SELECT public.purge_synced_bookings();'
);

-- 4. Comprobación manual (Opcional para el desarrollador)
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
