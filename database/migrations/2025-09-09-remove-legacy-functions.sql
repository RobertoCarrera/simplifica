-- =============================================================
-- REMOVE LEGACY COMPANY CONTEXT FUNCTIONS & RLS ARTIFACTS
-- Fecha: 2025-09-09
-- Objetivo: eliminar funciones antiguas y scripts residuales que usan
--           get_current_company_id / get_user_company_id en favor de
--           políticas simples basadas en public.users.
-- =============================================================

-- 1. Drop funciones legacy si existen (envueltas por DO para idempotencia)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_current_company_id') THEN
    EXECUTE 'DROP FUNCTION public.get_current_company_id()';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_user_company_id') THEN
    EXECUTE 'DROP FUNCTION public.get_user_company_id()';
  END IF;
END $$;

-- 2. Advertencia: si alguna política todavía dependía de ellas, fallará arriba.
--    En ese caso ejecutar previamente el script final de políticas.

-- 3. Verificación final
SELECT json_build_object(
  'still_has_get_current_company_id', EXISTS(SELECT 1 FROM pg_proc WHERE proname='get_current_company_id'),
  'still_has_get_user_company_id', EXISTS(SELECT 1 FROM pg_proc WHERE proname='get_user_company_id')
) as legacy_function_state;

-- FIN