-- =====================================================
-- FIX URGENTE: Addresses RLS incompatible con Clients
-- =====================================================
-- PROBLEMA: addresses usa usuario_id, clients usa company_id
-- SOLUCIÓN: Agregar company_id a addresses y actualizar policies
-- =====================================================

-- =====================================================
-- PASO 1: Agregar columna company_id a addresses
-- =====================================================

-- Verificar si company_id ya existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'addresses' 
    AND column_name = 'company_id'
  ) THEN
    -- Agregar columna company_id
    ALTER TABLE addresses 
    ADD COLUMN company_id UUID REFERENCES companies(id);
    
    RAISE NOTICE '✅ Columna company_id agregada a addresses';
  ELSE
    RAISE NOTICE 'ℹ️  Columna company_id ya existe en addresses';
  END IF;
END $$;

-- =====================================================
-- PASO 2: Migrar datos - Copiar company_id desde users
-- =====================================================

-- Actualizar addresses existentes con company_id desde public.users
-- Nota: addresses.usuario_id → auth.users.id
--       Necesitamos buscar en public.users donde auth_user_id = addresses.usuario_id
UPDATE addresses a
SET company_id = (
  SELECT u.company_id 
  FROM public.users u 
  WHERE u.auth_user_id = a.usuario_id 
  LIMIT 1
)
WHERE a.company_id IS NULL 
  AND a.usuario_id IS NOT NULL;

-- Verificar cuántas se actualizaron
DO $$
DECLARE
  updated_count INTEGER;
  null_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count FROM addresses;
  SELECT COUNT(*) INTO updated_count FROM addresses WHERE company_id IS NOT NULL;
  SELECT COUNT(*) INTO null_count FROM addresses WHERE company_id IS NULL;
  
  RAISE NOTICE '📊 Total addresses: %', total_count;
  RAISE NOTICE '✅ Addresses con company_id: %', updated_count;
  RAISE NOTICE '⚠️  Addresses sin company_id: %', null_count;
  
  -- Mostrar detalles de los que no tienen company_id
  IF null_count > 0 THEN
    RAISE NOTICE '🔍 Verificando addresses sin company_id...';
    PERFORM id, usuario_id, created_at 
    FROM addresses 
    WHERE company_id IS NULL;
  END IF;
END $$;

-- =====================================================
-- PASO 3: ELIMINAR políticas RLS antiguas de addresses
-- =====================================================

DROP POLICY IF EXISTS "Users can delete own addresses" ON addresses;
DROP POLICY IF EXISTS "Users can insert own addresses" ON addresses;
DROP POLICY IF EXISTS "Users can update own addresses" ON addresses;
DROP POLICY IF EXISTS "Users can view own addresses" ON addresses;
DROP POLICY IF EXISTS "addresses_own_user_only" ON addresses;

-- =====================================================
-- PASO 4: CREAR nuevas políticas RLS basadas en company_id
-- =====================================================

-- Política SELECT - Ver direcciones de la empresa
CREATE POLICY "addresses_select_company_only"
ON addresses FOR SELECT
TO public
USING (company_id = get_user_company_id());

-- Política INSERT - Crear direcciones en la empresa
CREATE POLICY "addresses_insert_company_only"
ON addresses FOR INSERT
TO public
WITH CHECK (company_id = get_user_company_id());

-- Política UPDATE - Actualizar direcciones de la empresa
CREATE POLICY "addresses_update_company_only"
ON addresses FOR UPDATE
TO public
USING (company_id = get_user_company_id())
WITH CHECK (company_id = get_user_company_id());

-- Política DELETE - Eliminar direcciones de la empresa
CREATE POLICY "addresses_delete_company_only"
ON addresses FOR DELETE
TO public
USING (company_id = get_user_company_id());

-- =====================================================
-- PASO 5: Crear índice para performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_addresses_company_id 
ON addresses(company_id);

-- =====================================================
-- PASO 6: VERIFICACIÓN - Nuevas políticas
-- =====================================================

SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'addresses'
ORDER BY policyname;

-- =====================================================
-- PASO 7: TEST - Consulta que fallaba antes
-- =====================================================

-- REEMPLAZAR 'TU-COMPANY-ID' con un company_id real
/*
SELECT 
  c.id as client_id,
  c.name as client_name,
  c.email,
  a.id as address_id,
  a.street,
  a.city
FROM clients c
LEFT JOIN addresses a ON c.direccion_id = a.id
WHERE c.company_id = 'TU-COMPANY-ID'
  AND c.deleted_at IS NULL
LIMIT 5;
*/

-- =====================================================
-- PASO 8: VERIFICACIÓN FINAL
-- =====================================================

SELECT 
  '✅ Fix completado' AS status,
  (
    SELECT COUNT(*) 
    FROM information_schema.columns 
    WHERE table_name = 'addresses' 
    AND column_name = 'company_id'
  ) AS tiene_company_id,
  (
    SELECT COUNT(*) 
    FROM addresses 
    WHERE company_id IS NOT NULL
  ) AS addresses_con_company,
  (
    SELECT COUNT(*) 
    FROM addresses 
    WHERE company_id IS NULL
  ) AS addresses_sin_company,
  (
    SELECT COUNT(*) 
    FROM pg_policies 
    WHERE tablename = 'addresses' 
    AND policyname LIKE '%company%'
  ) AS policies_nuevas;

-- =====================================================
-- PASO 9: (OPCIONAL) Hacer company_id NOT NULL
-- =====================================================
-- Solo ejecutar si todos los addresses tienen company_id

/*
-- Verificar primero que no haya nulls
SELECT COUNT(*) FROM addresses WHERE company_id IS NULL;

-- Si el resultado es 0, entonces puedes hacer:
ALTER TABLE addresses 
ALTER COLUMN company_id SET NOT NULL;
*/

-- =====================================================
-- NOTAS IMPORTANTES:
-- =====================================================
-- 1. Ejecutar cada paso y verificar resultados
-- 2. Si hay addresses sin company_id, investigar por qué
-- 3. Backup recomendado antes de ejecutar
-- 4. Después de esto, la consulta con JOIN debería funcionar
-- =====================================================
