-- ==== DIAGNÓSTICO DEL SISTEMA MULTI-TENANT ====
-- Ejecuta este script para identificar problemas con RLS

-- 1) Verificar estructura de tablas
SELECT 'Verificando tablas...' as step;

SELECT table_name, 
       (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
AND table_name IN ('companies', 'users', 'clients', 'services', 'jobs', 'job_notes', 'attachments')
ORDER BY table_name;

-- 2) Verificar datos existentes
SELECT 'Verificando datos existentes...' as step;

SELECT 'companies' as table_name, count(*) as total_records, count(*) FILTER (WHERE deleted_at IS NULL) as active_records
FROM public.companies
UNION ALL
SELECT 'users', count(*), count(*) FILTER (WHERE deleted_at IS NULL)
FROM public.users
UNION ALL
SELECT 'clients', count(*), count(*) FILTER (WHERE deleted_at IS NULL)
FROM public.clients
UNION ALL
SELECT 'services', count(*), count(*) FILTER (WHERE deleted_at IS NULL)
FROM public.services
UNION ALL
SELECT 'jobs', count(*), count(*) FILTER (WHERE deleted_at IS NULL)
FROM public.jobs
UNION ALL
SELECT 'attachments', count(*), count(*) FILTER (WHERE deleted_at IS NULL)
FROM public.attachments;

-- 3) Verificar políticas RLS
SELECT 'Verificando políticas RLS...' as step;

SELECT schemaname, tablename, policyname, permissive
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('companies', 'users', 'clients', 'services', 'jobs', 'job_notes', 'attachments')
ORDER BY tablename, policyname;

-- 4) Verificar clientes por empresa (sin contexto)
SELECT 'Verificando clientes por empresa (sin contexto)...' as step;

-- Quitar cualquier contexto existente
SELECT set_config('app.current_company_id', '', true);

SELECT 
  c.company_id,
  comp.name as company_name,
  count(*) as client_count,
  array_agg(c.name) as client_names
FROM public.clients c
LEFT JOIN public.companies comp ON comp.id = c.company_id
WHERE c.deleted_at IS NULL
GROUP BY c.company_id, comp.name
ORDER BY c.company_id;

-- 5) Test manual del contexto
SELECT 'Testing contexto manual...' as step;

-- Test empresa 1
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000001');
SELECT 
  'Empresa 1' as test,
  count(*) as clients_visible,
  current_setting('app.current_company_id', true) as current_context
FROM public.clients;

-- Test empresa 2  
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000002');
SELECT 
  'Empresa 2' as test,
  count(*) as clients_visible,
  current_setting('app.current_company_id', true) as current_context
FROM public.clients;

-- Limpiar contexto
SELECT set_config('app.current_company_id', '', true);

-- 6) Verificar función get_current_company_id
SELECT 'Testing función get_current_company_id...' as step;

-- Sin contexto
SELECT 
  'Sin contexto' as test,
  public.get_current_company_id() as company_id,
  current_setting('app.current_company_id', true) as setting_value;

-- Con contexto empresa 1
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000001');
SELECT 
  'Con contexto empresa 1' as test,
  public.get_current_company_id() as company_id,
  current_setting('app.current_company_id', true) as setting_value;

-- Con contexto empresa 2
SELECT public.set_current_company_context('00000000-0000-4000-8000-000000000002');
SELECT 
  'Con contexto empresa 2' as test,
  public.get_current_company_id() as company_id,
  current_setting('app.current_company_id', true) as setting_value;

-- Limpiar
SELECT set_config('app.current_company_id', '', true);

-- 7) Diagnóstico de problemas comunes
SELECT 'Diagnóstico de problemas...' as step;

-- Buscar clientes duplicados
WITH client_counts AS (
  SELECT company_id, name, email, count(*) as duplicates
  FROM public.clients
  WHERE deleted_at IS NULL
  GROUP BY company_id, name, email
  HAVING count(*) > 1
)
SELECT 
  'Clientes duplicados encontrados' as issue,
  count(*) as total_duplicates
FROM client_counts;

-- Buscar empresas sin UUIDs válidos
SELECT 
  'Empresas con IDs inválidos' as issue,
  count(*) as total
FROM public.companies
WHERE id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 8) Recomendaciones
SELECT 'RECOMENDACIONES:' as step;
SELECT '1. Si hay clientes duplicados, ejecutar: UPDATE clients SET deleted_at = NOW() WHERE id NOT IN (SELECT DISTINCT ON (company_id, name) id FROM clients WHERE deleted_at IS NULL);' as recommendation
UNION ALL
SELECT '2. Si RLS no funciona, verificar que las políticas están aplicadas correctamente'
UNION ALL
SELECT '3. Si hay contexto residual, ejecutar: SELECT set_config(''app.current_company_id'', '''', true);'
UNION ALL
SELECT '4. Para testing manual usar: SELECT public.set_current_company_context(''uuid-empresa'');';

-- 9) Reset completo (descomenta si necesitas limpiar todo)
/*
SELECT 'RESET COMPLETO (descomenta para ejecutar)' as step;

-- Limpiar datos de test
UPDATE public.clients SET deleted_at = NOW() WHERE name LIKE '%Demo%' OR name LIKE '%Test%';
UPDATE public.jobs SET deleted_at = NOW() WHERE title LIKE '%Demo%' OR title LIKE '%Test%';

-- Limpiar contexto
SELECT set_config('app.current_company_id', '', true);

-- Reinsertar datos básicos
INSERT INTO public.clients (company_id, name, email) VALUES 
  ('00000000-0000-4000-8000-000000000001', 'Cliente Base 1', 'base1@demo1.com'),
  ('00000000-0000-4000-8000-000000000002', 'Cliente Base 2', 'base2@demo2.com')
ON CONFLICT DO NOTHING;
*/
