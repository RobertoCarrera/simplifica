-- 20260129153000_fix_notifications_insert_policy.sql

-- MIGRACIÓN DE SEGURIDAD: RESTRICT NOTIFICATIONS INSERT
-- Objetivo: Evitar que usuarios autenticados creen notificaciones falsas o spam.
-- Riesgo Actual: La policy "Authenticated users can insert notifications" permite INSERT con check (true).
-- Solución: Eliminar la policy de INSERT para el rol 'authenticated'. 
-- Las notificaciones deben ser generadas únicamente por el sistema (Triggers, Edge Functions) o RPCs seguros.

-- 1. Eliminar la policy permisiva
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

-- 2. Asegurar que no hay otra policy de insert abierta (opcional, limpieza)
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.notifications;

-- Nota: Si el frontend necesita crear notificaciones (ej. chat), se debe implementar 
-- una función RPC (Security Definer) que valide el remitente y el contenido.
