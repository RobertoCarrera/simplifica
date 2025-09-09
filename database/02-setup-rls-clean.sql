-- DEPRECATED: Reemplazado por política minimalista (ver base-auth-structure.sql y scripts 2025-09-09-*).
-- Mantener sólo como referencia histórica. NO ejecutar en nuevo entorno.
-- ==== LEGACY RLS SCRIPT (OBSOLETO) ====
-- (Contenido original debajo)

-- 1) Limpiar completamente el estado anterior
SELECT 'Limpiando estado anterior...' as step;

-- Deshabilitar RLS temporalmente para limpieza completa
ALTER TABLE IF EXISTS public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.services DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.attachments DISABLE ROW LEVEL SECURITY;

-- Eliminar todas las políticas existentes
DROP POLICY IF EXISTS "temp_allow_all" ON public.companies;
DROP POLICY IF EXISTS "temp_allow_all" ON public.users;
DROP POLICY IF EXISTS "temp_allow_all" ON public.clients;
DROP POLICY IF EXISTS "temp_allow_all" ON public.services;
DROP POLICY IF EXISTS "temp_allow_all" ON public.jobs;
DROP POLICY IF EXISTS "temp_allow_all" ON public.job_notes;
DROP POLICY IF EXISTS "temp_allow_all" ON public.attachments;

DROP POLICY IF EXISTS "company_isolation" ON public.companies;
DROP POLICY IF EXISTS "company_users" ON public.users;
DROP POLICY IF EXISTS "company_clients" ON public.clients;
DROP POLICY IF EXISTS "company_services" ON public.services;
DROP POLICY IF EXISTS "company_jobs" ON public.jobs;
DROP POLICY IF EXISTS "company_job_notes" ON public.job_notes;
DROP POLICY IF EXISTS "company_attachments" ON public.attachments;

-- Limpiar contexto
SELECT set_config('app.current_company_id', '', false);

-- 2) Recrear funciones base correctamente
SELECT 'Creando funciones base...' as step;

CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid AS $$
DECLARE
  company_uuid text;
BEGIN
  BEGIN
    company_uuid := current_setting('app.current_company_id', true);
    IF company_uuid IS NOT NULL AND company_uuid != '' THEN
      RETURN company_uuid::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Continuar
  END;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_current_company_context(company_uuid uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_company_id', company_uuid::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3) Limpiar datos de prueba existentes
SELECT 'Limpiando datos de prueba...' as step;

-- Soft delete de todos los clientes de demo/test
UPDATE public.clients SET deleted_at = NOW() 
WHERE (name LIKE '%Demo%' OR name LIKE '%Test%' OR email LIKE '%demo%' OR email LIKE '%test%') 
AND deleted_at IS NULL;

-- Asegurar datos básicos consistentes
INSERT INTO public.clients (company_id, name, email) VALUES 
  ('00000000-0000-4000-8000-000000000001', 'Cliente Base 1', 'base1@empresa1.com'),
  ('00000000-0000-4000-8000-000000000002', 'Cliente Base 2', 'base2@empresa2.com')
ON CONFLICT (email) DO UPDATE SET 
  deleted_at = NULL,
  name = EXCLUDED.name,
  company_id = EXCLUDED.company_id;

-- 4) Habilitar RLS y crear políticas
SELECT 'Configurando RLS...' as step;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- Companies
CREATE POLICY "company_isolation" ON public.companies
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR 
      id = public.get_current_company_id()
    )
  );

-- Users
CREATE POLICY "company_users" ON public.users
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR 
      company_id = public.get_current_company_id()
    )
  );

-- Clients
CREATE POLICY "company_clients" ON public.clients
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR 
      company_id = public.get_current_company_id()
    )
  );

-- Services
CREATE POLICY "company_services" ON public.services
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR 
      company_id = public.get_current_company_id()
    )
  );

-- Jobs
CREATE POLICY "company_jobs" ON public.jobs
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR 
      company_id = public.get_current_company_id()
    )
  );

-- Job notes
CREATE POLICY "company_job_notes" ON public.job_notes
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j 
      WHERE j.id = job_id 
      AND j.deleted_at IS NULL 
      AND (
        public.get_current_company_id() IS NULL OR 
        j.company_id = public.get_current_company_id()
      )
    )
  );

-- Attachments
CREATE POLICY "company_attachments" ON public.attachments
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR 
      company_id = public.get_current_company_id()
    )
  );

-- 5) Test paso a paso del sistema
SELECT 'Ejecutando tests...' as step;

DO $$
DECLARE
  company1_id uuid := '00000000-0000-4000-8000-000000000001';
  company2_id uuid := '00000000-0000-4000-8000-000000000002';
  total_no_context integer;
  company1_count integer;
  company2_count integer;
BEGIN
  -- Verificar estado sin contexto
  SELECT count(*) INTO total_no_context FROM public.clients WHERE deleted_at IS NULL;
  RAISE NOTICE 'Total clientes sin contexto: %', total_no_context;
  
  -- Test empresa 1
  PERFORM public.set_current_company_context(company1_id);
  SELECT count(*) INTO company1_count FROM public.clients;
  RAISE NOTICE 'Empresa 1 - Contexto: %, Clientes visibles: %', 
    current_setting('app.current_company_id', true), company1_count;
  
  -- Test empresa 2
  PERFORM public.set_current_company_context(company2_id);
  SELECT count(*) INTO company2_count FROM public.clients;
  RAISE NOTICE 'Empresa 2 - Contexto: %, Clientes visibles: %', 
    current_setting('app.current_company_id', true), company2_count;
  
  -- Limpiar contexto
  PERFORM set_config('app.current_company_id', '', false);
  
  -- Validaciones
  IF company1_count != 1 THEN
    RAISE NOTICE 'ADVERTENCIA: Empresa 1 tiene % clientes, se esperaba 1', company1_count;
    -- Listar clientes para debug
    PERFORM public.set_current_company_context(company1_id);
    RAISE NOTICE 'Clientes empresa 1: %', (
      SELECT string_agg(name || ' (' || email || ')', ', ') 
      FROM public.clients 
      WHERE deleted_at IS NULL
    );
    PERFORM set_config('app.current_company_id', '', false);
  END IF;
  
  IF company2_count != 1 THEN
    RAISE NOTICE 'ADVERTENCIA: Empresa 2 tiene % clientes, se esperaba 1', company2_count;
    -- Listar clientes para debug
    PERFORM public.set_current_company_context(company2_id);
    RAISE NOTICE 'Clientes empresa 2: %', (
      SELECT string_agg(name || ' (' || email || ')', ', ') 
      FROM public.clients 
      WHERE deleted_at IS NULL
    );
    PERFORM set_config('app.current_company_id', '', false);
  END IF;
  
  IF company1_count = 1 AND company2_count = 1 THEN
    RAISE NOTICE '✅ RLS Multi-tenant funcionando correctamente!';
  ELSE
    RAISE NOTICE '⚠️  RLS configurado pero con datos inconsistentes. Ver mensajes arriba.';
  END IF;
END $$;

-- 6) Verificación final detallada
SELECT 'Verificación final...' as step;

-- Estado actual de datos
SELECT 
  'Estado actual' as info,
  (SELECT count(*) FROM public.companies WHERE deleted_at IS NULL) as companies,
  (SELECT count(*) FROM public.users WHERE deleted_at IS NULL) as users,
  (SELECT count(*) FROM public.clients WHERE deleted_at IS NULL) as clients,
  (SELECT count(*) FROM public.services WHERE deleted_at IS NULL) as services,
  (SELECT count(*) FROM public.jobs WHERE deleted_at IS NULL) as jobs;

-- Test manual simple (sin PERFORM fuera de bloques!)
SELECT 'Test manual: Sin contexto' as test, count(*) as clientes_visibles FROM public.clients;

-- Test con contextos usando SELECT en lugar de PERFORM
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000001'::uuid);
SELECT 'Test manual: Empresa 1' as test, count(*) as clientes_visibles FROM public.clients;

SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000002'::uuid);
SELECT 'Test manual: Empresa 2' as test, count(*) as clientes_visibles FROM public.clients;

-- Limpiar contexto final
SELECT set_config('app.current_company_id', '', false);

SELECT '✅ Setup RLS completado. El sistema está listo para usar.' as resultado;
