-- ==== RLS MULTI-TENANT SEGURO ====
-- Ejecutar DESPUÉS del setup inicial
-- Este script reemplaza las políticas temporales por políticas seguras

-- 1) Función para obtener company_id del contexto actual
-- Versión que lee de una variable de sesión O de un parámetro
CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid AS $$
DECLARE
  company_uuid text;
BEGIN
  -- Opción 1: leer de variable de sesión (cuando esté configurada)
  BEGIN
    company_uuid := current_setting('app.current_company_id', true);
    IF company_uuid IS NOT NULL AND company_uuid != '' THEN
      RETURN company_uuid::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Continuar con siguiente opción
  END;
  
  -- Opción 2: Por ahora devolver NULL para permitir operaciones de setup
  -- En producción esto buscará el company_id del usuario autenticado
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2) Eliminar políticas temporales
DROP POLICY IF EXISTS "temp_allow_all" ON public.companies;
DROP POLICY IF EXISTS "temp_allow_all" ON public.users;
DROP POLICY IF EXISTS "temp_allow_all" ON public.clients;
DROP POLICY IF EXISTS "temp_allow_all" ON public.services;
DROP POLICY IF EXISTS "temp_allow_all" ON public.jobs;
DROP POLICY IF EXISTS "temp_allow_all" ON public.job_notes;
DROP POLICY IF EXISTS "temp_allow_all" ON public.attachments;

-- 3) Políticas RLS que respetan multi-tenancy

-- Companies: solo la propia company
CREATE POLICY "company_isolation" ON public.companies
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR -- permite durante setup
      id = public.get_current_company_id()
    )
  );

-- Users: solo usuarios de la misma company
CREATE POLICY "company_users" ON public.users
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR -- permite durante setup
      company_id = public.get_current_company_id()
    )
  );

-- Clients: solo clientes de la misma company
CREATE POLICY "company_clients" ON public.clients
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR -- permite durante setup
      company_id = public.get_current_company_id()
    )
  );

-- Services: solo servicios de la misma company
CREATE POLICY "company_services" ON public.services
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR -- permite durante setup
      company_id = public.get_current_company_id()
    )
  );

-- Jobs: solo trabajos de la misma company
CREATE POLICY "company_jobs" ON public.jobs
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR -- permite durante setup
      company_id = public.get_current_company_id()
    )
  );

-- Job notes: solo notas de trabajos de la misma company
CREATE POLICY "company_job_notes" ON public.job_notes
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j 
      WHERE j.id = job_id 
      AND j.deleted_at IS NULL 
      AND (
        public.get_current_company_id() IS NULL OR -- permite durante setup
        j.company_id = public.get_current_company_id()
      )
    )
  );

-- Attachments: solo adjuntos de la misma company
CREATE POLICY "company_attachments" ON public.attachments
  FOR ALL 
  USING (
    deleted_at IS NULL AND (
      public.get_current_company_id() IS NULL OR -- permite durante setup
      company_id = public.get_current_company_id()
    )
  );

-- 4) Función helper para establecer contexto de company
CREATE OR REPLACE FUNCTION public.set_current_company_context(company_uuid uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_company_id', company_uuid::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5) Testing del sistema multi-tenant
DO $$
DECLARE
  company1_id uuid := '00000000-0000-4000-8000-000000000001';
  company2_id uuid := '00000000-0000-4000-8000-000000000002';
  client1_id uuid;
  client2_id uuid;
  company1_count integer;
  company2_count integer;
BEGIN
  -- Limpiar clientes de test previos (soft delete para no romper referencias)
  UPDATE public.clients SET deleted_at = NOW() 
  WHERE name LIKE 'Cliente Demo %' AND deleted_at IS NULL;
  
  -- Agregar clientes de test específicos
  INSERT INTO public.clients (company_id, name, email) VALUES 
    (company1_id, 'Cliente Demo 1 Test', 'test1@demo1.com'),
    (company2_id, 'Cliente Demo 2 Test', 'test2@demo2.com');
  
  -- Test: establecer contexto para company 1
  PERFORM public.set_current_company_context(company1_id);
  
  -- Contar clientes de company 1
  SELECT count(*) INTO company1_count FROM public.clients;
  
  -- Test: establecer contexto para company 2
  PERFORM public.set_current_company_context(company2_id);
  
  -- Contar clientes de company 2
  SELECT count(*) INTO company2_count FROM public.clients;
  
  -- Limpiar contexto antes de validar
  PERFORM set_config('app.current_company_id', '', true);
  
  -- Validaciones con mensajes informativos
  IF company1_count != 1 THEN
    RAISE EXCEPTION 'RLS test failed for company 1: expected 1 client, got %. Check if there are existing clients for this company.', company1_count;
  END IF;
  
  IF company2_count != 1 THEN
    RAISE EXCEPTION 'RLS test failed for company 2: expected 1 client, got %. Check if there are existing clients for this company.', company2_count;
  END IF;
  
  -- Limpiar datos de test
  UPDATE public.clients SET deleted_at = NOW() 
  WHERE name LIKE 'Cliente Demo % Test' AND deleted_at IS NULL;
  
  RAISE NOTICE 'RLS Multi-tenant test PASSED! Company 1: % clients, Company 2: % clients', company1_count, company2_count;
END $$;

-- 6) Verificación final
SELECT 'RLS Configurado. Testing:' as status;

-- Sin contexto (debe ver todo durante setup)
SELECT count(*) as total_clients_no_context FROM public.clients;

-- Con contexto de company 1
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000001');
SELECT count(*) as company1_clients FROM public.clients;

-- Con contexto de company 2  
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000002');
SELECT count(*) as company2_clients FROM public.clients;

-- Limpiar contexto
SELECT set_config('app.current_company_id', '', true);
