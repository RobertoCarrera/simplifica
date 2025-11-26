-- =====================================================
-- FIX: Eliminar funciones con nombres de parámetros diferentes
-- Ejecutar ANTES del script principal si da error
-- =====================================================

DROP FUNCTION IF EXISTS public.get_verifactu_settings_for_company(UUID);
DROP FUNCTION IF EXISTS public.upsert_verifactu_settings(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN);

-- Ahora puedes ejecutar VERIFACTU_PRODUCTION_MIGRATION.sql
