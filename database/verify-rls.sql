-- ==== VERIFICACIÓN RÁPIDA DEL SISTEMA RLS ====
-- Ejecuta este script para verificar que todo funciona correctamente

-- 1) Estado actual del sistema
SELECT 'ESTADO ACTUAL DEL SISTEMA' as seccion;

SELECT 
  'Datos en el sistema' as tipo,
  (SELECT count(*) FROM public.companies WHERE deleted_at IS NULL) as empresas,
  (SELECT count(*) FROM public.users WHERE deleted_at IS NULL) as usuarios,
  (SELECT count(*) FROM public.clients WHERE deleted_at IS NULL) as clientes_total;

-- 2) Test de contexto paso a paso
SELECT 'TESTS DE CONTEXTO' as seccion;

-- Limpiar cualquier contexto previo
SELECT set_config('app.current_company_id', '', false);

-- Sin contexto (debería ver todos los clientes)
SELECT 
  'Sin contexto' as test,
  count(*) as clientes_visibles,
  current_setting('app.current_company_id', true) as contexto_actual
FROM public.clients 
WHERE deleted_at IS NULL;

-- Con contexto empresa 1
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000001'::uuid);
SELECT 
  'Empresa 1' as test,
  count(*) as clientes_visibles,
  current_setting('app.current_company_id', true) as contexto_actual
FROM public.clients;

-- Con contexto empresa 2
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000002'::uuid);
SELECT 
  'Empresa 2' as test,
  count(*) as clientes_visibles,
  current_setting('app.current_company_id', true) as contexto_actual
FROM public.clients;

-- 3) Detalles de clientes por empresa
SELECT 'DETALLES POR EMPRESA' as seccion;

-- Empresa 1
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000001'::uuid);
SELECT 
  'Empresa 1' as empresa,
  name as cliente_nombre,
  email as cliente_email,
  created_at as fecha_creacion
FROM public.clients
ORDER BY created_at;

-- Empresa 2  
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000002'::uuid);
SELECT 
  'Empresa 2' as empresa,
  name as cliente_nombre,
  email as cliente_email,
  created_at as fecha_creacion
FROM public.clients
ORDER BY created_at;

-- 4) Verificación de políticas RLS
SELECT 'POLÍTICAS RLS ACTIVAS' as seccion;

SELECT 
  tablename as tabla,
  policyname as politica,
  cmd as operacion
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN ('companies', 'users', 'clients', 'services', 'jobs', 'job_notes', 'attachments')
ORDER BY tablename, policyname;

-- 5) Test de inserción con contexto
SELECT 'TEST DE INSERCIÓN' as seccion;

DO $$
DECLARE
  test_client_id uuid;
BEGIN
  -- Establecer contexto para empresa 1
  PERFORM public.set_current_company_context('00000000-0000-4000-8000-000000000001'::uuid);
  
  -- Intentar insertar cliente
  INSERT INTO public.clients (company_id, name, email) 
  VALUES ('00000000-0000-4000-8000-000000000001', 'Cliente Test Verificación', 'test-verificacion@empresa1.com')
  RETURNING id INTO test_client_id;
  
  RAISE NOTICE 'Cliente test insertado con ID: %', test_client_id;
  
  -- Verificar que se ve en el contexto correcto
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = test_client_id) THEN
    RAISE EXCEPTION 'ERROR: Cliente insertado pero no visible en mismo contexto';
  END IF;
  
  -- Cambiar a empresa 2 y verificar que NO se ve
  PERFORM public.set_current_company_context('00000000-0000-4000-8000-000000000002'::uuid);
  
  IF EXISTS (SELECT 1 FROM public.clients WHERE id = test_client_id) THEN
    RAISE EXCEPTION 'ERROR: Cliente visible en contexto incorrecto';
  END IF;
  
  -- Limpiar: volver a empresa 1 y eliminar cliente test
  PERFORM public.set_current_company_context('00000000-0000-4000-8000-000000000001'::uuid);
  UPDATE public.clients SET deleted_at = NOW() WHERE id = test_client_id;
  
  RAISE NOTICE '✅ Test de inserción y aislamiento: CORRECTO';
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Test de inserción falló: %', SQLERRM;
END $$;

-- 6) Limpiar contexto y mostrar resumen
SELECT set_config('app.current_company_id', '', false);

SELECT 'RESUMEN FINAL' as seccion;

SELECT 
  CASE 
    WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'clients') > 0 
    THEN '✅ RLS habilitado y configurado'
    ELSE '❌ RLS no configurado'
  END as estado_rls,
  
  CASE 
    WHEN EXISTS (SELECT 1 FROM public.companies WHERE id = '00000000-0000-4000-8000-000000000001')
    THEN '✅ Empresas demo configuradas'
    ELSE '❌ Faltan empresas demo'
  END as estado_empresas,
  
  (SELECT count(*) FROM public.clients WHERE deleted_at IS NULL) as total_clientes_activos;

-- Instrucciones de uso
SELECT 'INSTRUCCIONES DE USO' as seccion;
SELECT 'Para usar el sistema multi-tenant en tu aplicación:' as instruccion
UNION ALL SELECT '1. Antes de cualquier operación: SELECT public.set_current_company_context(''uuid-empresa'');'
UNION ALL SELECT '2. Ejecutar tus consultas normales: SELECT * FROM clients;'
UNION ALL SELECT '3. Los datos se filtrarán automáticamente por empresa'
UNION ALL SELECT '4. Para limpiar contexto: SELECT set_config(''app.current_company_id'', '''', false);';

SELECT '🎉 Verificación completada!' as resultado;
