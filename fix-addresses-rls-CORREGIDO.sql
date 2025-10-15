-- =====================================================
-- FIX DEFINITIVO: Addresses RLS Compatible con Clients
-- =====================================================
-- Basado en estructura real de Supabase
-- Fecha: 2025-10-15
-- =====================================================

-- =====================================================
-- DIAGNÓSTICO: Verificar estado actual
-- =====================================================

-- Ver estructura actual de addresses
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'addresses'
  AND column_name IN ('id', 'usuario_id', 'company_id', 'created_at')
ORDER BY ordinal_position;

-- Ver cuántas addresses tienen company_id
SELECT 
  COUNT(*) as total_addresses,
  COUNT(company_id) as con_company_id,
  COUNT(*) - COUNT(company_id) as sin_company_id
FROM addresses;

-- =====================================================
-- PASO 1: Migrar company_id a addresses existentes
-- =====================================================

-- addresses.usuario_id → auth.users.id
-- Necesitamos buscar en public.users.auth_user_id
UPDATE addresses a
SET company_id = (
  SELECT u.company_id 
  FROM public.users u 
  WHERE u.auth_user_id = a.usuario_id 
  LIMIT 1
)
WHERE a.company_id IS NULL 
  AND a.usuario_id IS NOT NULL;

-- Verificar resultados de la migración
DO $$
DECLARE
  total_count INTEGER;
  updated_count INTEGER;
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM addresses;
  SELECT COUNT(*) INTO updated_count FROM addresses WHERE company_id IS NOT NULL;
  SELECT COUNT(*) INTO null_count FROM addresses WHERE company_id IS NULL;
  
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '📊 MIGRACIÓN DE DATOS COMPLETADA';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '  Total addresses:           %', total_count;
  RAISE NOTICE '  ✅ Con company_id:         %', updated_count;
  RAISE NOTICE '  ⚠️  Sin company_id:        %', null_count;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  
  IF null_count > 0 THEN
    RAISE WARNING '⚠️  Hay % addresses sin company_id - Revisar manualmente', null_count;
  END IF;
END $$;

-- Si hay addresses sin company_id, mostrarlas
SELECT 
  id,
  usuario_id,
  direccion,
  created_at,
  '⚠️ Sin company_id' as status
FROM addresses 
WHERE company_id IS NULL
LIMIT 10;

-- =====================================================
-- PASO 2: ELIMINAR políticas RLS antiguas
-- =====================================================

DROP POLICY IF EXISTS "Users can delete own addresses" ON addresses;
DROP POLICY IF EXISTS "Users can insert own addresses" ON addresses;
DROP POLICY IF EXISTS "Users can update own addresses" ON addresses;
DROP POLICY IF EXISTS "Users can view own addresses" ON addresses;
DROP POLICY IF EXISTS "addresses_own_user_only" ON addresses;

-- =====================================================
-- PASO 3: CREAR nuevas políticas RLS
-- =====================================================

-- Política SELECT - Ver direcciones de la empresa
CREATE POLICY "addresses_select_company_only"
ON addresses FOR SELECT
TO public
USING (
  company_id = get_user_company_id()
);

-- Política INSERT - Crear direcciones en la empresa
CREATE POLICY "addresses_insert_company_only"
ON addresses FOR INSERT
TO public
WITH CHECK (
  company_id = get_user_company_id()
);

-- Política UPDATE - Actualizar direcciones de la empresa
CREATE POLICY "addresses_update_company_only"
ON addresses FOR UPDATE
TO public
USING (
  company_id = get_user_company_id()
)
WITH CHECK (
  company_id = get_user_company_id()
);

-- Política DELETE - Eliminar direcciones de la empresa
CREATE POLICY "addresses_delete_company_only"
ON addresses FOR DELETE
TO public
USING (
  company_id = get_user_company_id()
);

-- =====================================================
-- PASO 4: Crear/Verificar índices
-- =====================================================

-- Índice en company_id para performance
CREATE INDEX IF NOT EXISTS idx_addresses_company_id 
ON addresses(company_id);

-- Índice compuesto para búsquedas comunes
CREATE INDEX IF NOT EXISTS idx_addresses_company_usuario 
ON addresses(company_id, usuario_id);

-- =====================================================
-- PASO 5: VERIFICACIÓN - Políticas creadas
-- =====================================================

SELECT 
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as separator,
  '📋 POLÍTICAS RLS DE ADDRESSES' as titulo
UNION ALL
SELECT 
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '';

SELECT 
  policyname as "Política",
  cmd as "Comando",
  CASE 
    WHEN policyname LIKE '%company%' THEN '✅ Nueva'
    ELSE '⚠️ Antigua'
  END as "Estado"
FROM pg_policies
WHERE tablename = 'addresses'
ORDER BY policyname;

-- =====================================================
-- PASO 6: VERIFICACIÓN - Índices
-- =====================================================

SELECT 
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as separator,
  '📊 ÍNDICES DE ADDRESSES' as titulo
UNION ALL
SELECT 
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '';

SELECT 
  indexname as "Índice",
  indexdef as "Definición"
FROM pg_indexes
WHERE tablename = 'addresses'
  AND schemaname = 'public'
ORDER BY indexname;

-- =====================================================
-- PASO 7: TEST - Consulta que antes fallaba
-- =====================================================

-- Obtener un company_id válido
DO $$
DECLARE
  test_company_id UUID;
  test_result TEXT;
BEGIN
  -- Obtener company_id del usuario actual o el primero disponible
  SELECT company_id INTO test_company_id
  FROM public.users
  WHERE company_id IS NOT NULL
  LIMIT 1;
  
  IF test_company_id IS NOT NULL THEN
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '🧪 TEST DE CONSULTA';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE 'Company ID de prueba: %', test_company_id;
    RAISE NOTICE '';
    RAISE NOTICE '📝 Ejecuta esta consulta manualmente:';
    RAISE NOTICE '';
    RAISE NOTICE 'SELECT c.id, c.name, c.email, a.direccion, a.locality_id';
    RAISE NOTICE 'FROM clients c';
    RAISE NOTICE 'LEFT JOIN addresses a ON c.direccion_id = a.id';
    RAISE NOTICE 'WHERE c.company_id = ''%''', test_company_id;
    RAISE NOTICE '  AND c.deleted_at IS NULL';
    RAISE NOTICE 'LIMIT 5;';
  ELSE
    RAISE WARNING 'No se encontró ningún company_id válido para testing';
  END IF;
END $$;

-- =====================================================
-- PASO 8: VERIFICACIÓN FINAL COMPLETA
-- =====================================================

SELECT 
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as separator,
  '✅ RESUMEN FINAL' as titulo
UNION ALL
SELECT 
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '';

SELECT 
  'Total Addresses' as metrica,
  COUNT(*)::text as valor
FROM addresses
UNION ALL
SELECT 
  'Con company_id',
  COUNT(*)::text
FROM addresses 
WHERE company_id IS NOT NULL
UNION ALL
SELECT 
  'Sin company_id',
  COUNT(*)::text
FROM addresses 
WHERE company_id IS NULL
UNION ALL
SELECT 
  'Políticas RLS (company)',
  COUNT(*)::text
FROM pg_policies 
WHERE tablename = 'addresses' 
  AND policyname LIKE '%company%'
UNION ALL
SELECT 
  'Índices',
  COUNT(*)::text
FROM pg_indexes 
WHERE tablename = 'addresses' 
  AND schemaname = 'public';

-- =====================================================
-- PASO 9: (OPCIONAL) Hacer company_id NOT NULL
-- =====================================================

-- Solo ejecutar si TODOS los addresses tienen company_id
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count 
  FROM addresses 
  WHERE company_id IS NULL;
  
  IF null_count = 0 THEN
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '✅ Todos los addresses tienen company_id';
    RAISE NOTICE '   Puedes ejecutar (si quieres):';
    RAISE NOTICE '   ALTER TABLE addresses';
    RAISE NOTICE '   ALTER COLUMN company_id SET NOT NULL;';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  ELSE
    RAISE WARNING '⚠️  HAY % addresses sin company_id', null_count;
    RAISE WARNING '   NO ejecutar ALTER COLUMN NOT NULL';
    RAISE WARNING '   Revisar addresses sin company_id primero';
  END IF;
END $$;

-- =====================================================
-- VERIFICACIÓN EXTRA: Comprobar que el JOIN funciona
-- =====================================================

-- Esta consulta simula lo que hace Angular
SELECT 
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' as separator,
  '🔍 TEST DE JOIN (como en Angular)' as titulo
UNION ALL
SELECT 
  '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  '';

-- Contar cuántos clients tienen direccion_id
WITH client_stats AS (
  SELECT 
    COUNT(*) as total_clients,
    COUNT(direccion_id) as con_direccion,
    COUNT(*) - COUNT(direccion_id) as sin_direccion
  FROM clients
  WHERE deleted_at IS NULL
)
SELECT 
  'Total Clients' as metrica,
  total_clients::text as valor
FROM client_stats
UNION ALL
SELECT 
  'Con direccion_id',
  con_direccion::text
FROM client_stats
UNION ALL
SELECT 
  'Sin direccion_id',
  sin_direccion::text
FROM client_stats;

-- =====================================================
-- NOTAS FINALES
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ SCRIPT COMPLETADO';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '';
  RAISE NOTICE '📋 SIGUIENTES PASOS:';
  RAISE NOTICE '1. Verificar que no hay addresses sin company_id';
  RAISE NOTICE '2. Probar la consulta de test en SQL Editor';
  RAISE NOTICE '3. Probar desde Angular (recompilar app)';
  RAISE NOTICE '4. Monitorear errores en consola';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  Si hay errores:';
  RAISE NOTICE '  - Revisar addresses sin company_id';
  RAISE NOTICE '  - Verificar función get_user_company_id()';
  RAISE NOTICE '  - Comprobar que usuario tiene company asignada';
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
