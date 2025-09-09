-- =====================================================================
-- AUTH POLICY & LEGACY FUNCTION CLEANUP (V2) - 2025-09-09
-- Objetivo:
--   1. Reemplazar dependencias de funciones legacy (get_current_company_id, get_user_company_id)
--   2. Eliminar políticas antiguas que las usan y recrear versiones simples basadas en public.users
--   3. Permitir eliminación segura de user_profiles y funciones asociadas
--   4. Evitar DROP CASCADE agresivo (no perder políticas nuevas)
-- =====================================================================
-- NOTA: Este script asume que la tabla canonical de usuario app es public.users con columna auth_user_id.

-- 0. Deshabilitar RLS temporalmente solo en tablas afectadas para evitar bloqueos
DO $$ BEGIN
  PERFORM 1 FROM pg_class WHERE relname='users';
  IF FOUND THEN EXECUTE 'ALTER TABLE public.users DISABLE ROW LEVEL SECURITY'; END IF;
  PERFORM 1 FROM pg_class WHERE relname='companies';
  IF FOUND THEN EXECUTE 'ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY'; END IF;
  PERFORM 1 FROM pg_class WHERE relname='clients';
  IF FOUND THEN EXECUTE 'ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY'; END IF;
  PERFORM 1 FROM pg_class WHERE relname='services';
  IF FOUND THEN EXECUTE 'ALTER TABLE public.services DISABLE ROW LEVEL SECURITY'; END IF;
  PERFORM 1 FROM pg_class WHERE relname='tickets';
  IF FOUND THEN EXECUTE 'ALTER TABLE public.tickets DISABLE ROW LEVEL SECURITY'; END IF;
  PERFORM 1 FROM pg_class WHERE relname='attachments';
  IF FOUND THEN EXECUTE 'ALTER TABLE public.attachments DISABLE ROW LEVEL SECURITY'; END IF;
END $$;

-- 1. DROP políticas que usan funciones legacy (dinámico)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN 
    SELECT policyname, tablename
    FROM pg_policies
    WHERE (policyname ILIKE 'allow_company_data%' OR policyname ILIKE 'Users can only see % from their company')
       OR (tablename IN ('clients','services','tickets','attachments') AND policyname ILIKE '%company%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 2. Crear (o reemplazar) funciones de compatibilidad simplificadas
-- Estas devuelven company_id basándose SOLO en public.users
CREATE OR REPLACE FUNCTION public.get_user_company_id() RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT company_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_current_company_id() RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT company_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1
$$;

COMMENT ON FUNCTION public.get_current_company_id() IS 'Compatibilidad legacy: reemplazada la lógica basada en user_profiles.';
COMMENT ON FUNCTION public.get_user_company_id() IS 'Compatibilidad legacy: apunta a public.users.';

-- 3. Recrear políticas mínimas por tabla (solo lo necesario). Idempotentes.
-- USERS & COMPANIES ya deben haber sido gestionadas por el script v1.
DO $$ BEGIN
  -- CLIENTS
  IF to_regclass('public.clients') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='clients_company_access' AND tablename='clients') THEN
      EXECUTE 'CREATE POLICY clients_company_access ON public.clients FOR ALL USING (company_id IN (SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()) AND deleted_at IS NULL)';
    END IF;
  END IF;
  -- SERVICES
  IF to_regclass('public.services') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='services_company_access' AND tablename='services') THEN
      EXECUTE 'CREATE POLICY services_company_access ON public.services FOR ALL USING (company_id IN (SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()) AND deleted_at IS NULL)';
    END IF;
  END IF;
  -- TICKETS
  IF to_regclass('public.tickets') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='tickets_company_access' AND tablename='tickets') THEN
      EXECUTE 'CREATE POLICY tickets_company_access ON public.tickets FOR ALL USING (company_id IN (SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()))';
    END IF;
  END IF;
  -- ATTACHMENTS
  IF to_regclass('public.attachments') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='attachments_company_access' AND tablename='attachments') THEN
      EXECUTE 'CREATE POLICY attachments_company_access ON public.attachments FOR ALL USING (company_id IN (SELECT company_id FROM public.users WHERE auth_user_id = auth.uid()) AND deleted_at IS NULL)';
    END IF;
  END IF;
END $$;

-- 4. Rehabilitar RLS
DO $$ BEGIN
  PERFORM 1 FROM pg_class WHERE relname='users'; IF FOUND THEN EXECUTE 'ALTER TABLE public.users ENABLE ROW LEVEL SECURITY'; END IF;
  PERFORM 1 FROM pg_class WHERE relname='companies'; IF FOUND THEN EXECUTE 'ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY'; END IF;
  PERFORM 1 FROM pg_class WHERE relname='clients'; IF FOUND THEN EXECUTE 'ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY'; END IF;
  PERFORM 1 FROM pg_class WHERE relname='services'; IF FOUND THEN EXECUTE 'ALTER TABLE public.services ENABLE ROW LEVEL SECURITY'; END IF;
  PERFORM 1 FROM pg_class WHERE relname='tickets'; IF FOUND THEN EXECUTE 'ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY'; END IF;
  PERFORM 1 FROM pg_class WHERE relname='attachments'; IF FOUND THEN EXECUTE 'ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY'; END IF;
END $$;

-- 5. (Opcional futuro) Si ya NO quedan dependencias de user_profiles y la tabla fue migrada:
--    DROP TABLE public.user_profiles CASCADE;  -- Ejecutar manualmente tras validar migración

-- 6. Verificación JSON
WITH p AS (
  SELECT tablename, policyname FROM pg_policies
  WHERE tablename IN ('users','companies','clients','services','tickets','attachments')
)
SELECT json_build_object(
  'users', (SELECT json_agg(policyname) FROM p WHERE tablename='users'),
  'companies', (SELECT json_agg(policyname) FROM p WHERE tablename='companies'),
  'clients', (SELECT json_agg(policyname) FROM p WHERE tablename='clients'),
  'services', (SELECT json_agg(policyname) FROM p WHERE tablename='services'),
  'tickets', (SELECT json_agg(policyname) FROM p WHERE tablename='tickets'),
  'attachments', (SELECT json_agg(policyname) FROM p WHERE tablename='attachments')
) AS policy_state;

-- =====================================================================
-- FIN V2
-- =====================================================================