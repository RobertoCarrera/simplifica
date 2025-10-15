-- =====================================================
-- FIX: Errores 400 en consultas de clientes
-- =====================================================
-- Ejecutar en Supabase SQL Editor
-- Fecha: 2025-10-15

-- =====================================================
-- 1. VERIFICAR FOREIGN KEY EXISTENTE
-- =====================================================

SELECT
  tc.table_name AS tabla_origen, 
  kcu.column_name AS columna_origen, 
  ccu.table_name AS tabla_destino,
  ccu.column_name AS columna_destino,
  tc.constraint_name AS nombre_constraint
FROM 
  information_schema.table_constraints AS tc 
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name='clients'
  AND (
    tc.constraint_name = 'clients_direccion_id_fkey' 
    OR kcu.column_name = 'direccion_id'
  );

-- =====================================================
-- 2. VERIFICAR ESTRUCTURA DE TABLA CLIENTS
-- =====================================================

SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM 
  information_schema.columns
WHERE 
  table_name = 'clients'
  AND column_name IN ('id', 'direccion_id', 'company_id', 'created_at', 'deleted_at')
ORDER BY 
  ordinal_position;

-- =====================================================
-- 3. VERIFICAR ESTRUCTURA DE TABLA ADDRESSES
-- =====================================================

SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM 
  information_schema.columns
WHERE 
  table_name = 'addresses'
  AND column_name IN ('id', 'company_id', 'created_at')
ORDER BY 
  ordinal_position;

-- =====================================================
-- 4. CREAR FOREIGN KEY SI NO EXISTE
-- =====================================================
-- Solo ejecutar si el paso 1 no mostró resultados

-- Primero verificar si la columna existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'clients' 
    AND column_name = 'direccion_id'
  ) THEN
    -- Crear columna si no existe
    ALTER TABLE clients 
    ADD COLUMN direccion_id UUID;
    
    RAISE NOTICE 'Columna direccion_id creada';
  ELSE
    RAISE NOTICE 'Columna direccion_id ya existe';
  END IF;
END $$;

-- Luego crear la foreign key
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'clients_direccion_id_fkey'
  ) THEN
    ALTER TABLE clients
    ADD CONSTRAINT clients_direccion_id_fkey
    FOREIGN KEY (direccion_id)
    REFERENCES addresses(id)
    ON DELETE SET NULL;
    
    RAISE NOTICE 'Foreign key clients_direccion_id_fkey creada';
  ELSE
    RAISE NOTICE 'Foreign key ya existe';
  END IF;
END $$;

-- =====================================================
-- 5. VERIFICAR POLÍTICAS RLS EN TABLA CLIENTS
-- =====================================================

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM 
  pg_policies
WHERE 
  tablename = 'clients'
ORDER BY 
  policyname;

-- =====================================================
-- 6. VERIFICAR POLÍTICAS RLS EN TABLA ADDRESSES
-- =====================================================

SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM 
  pg_policies
WHERE 
  tablename = 'addresses'
ORDER BY 
  policyname;

-- =====================================================
-- 7. CREAR POLÍTICA RLS PARA ADDRESSES SI FALTA
-- =====================================================

-- Habilitar RLS si no está habilitado
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

-- Política para SELECT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'addresses' 
    AND policyname = 'Usuarios pueden ver direcciones de su empresa'
  ) THEN
    CREATE POLICY "Usuarios pueden ver direcciones de su empresa"
    ON addresses FOR SELECT
    TO authenticated
    USING (
      company_id IN (
        SELECT company_id 
        FROM user_companies 
        WHERE user_id = auth.uid()
      )
    );
    
    RAISE NOTICE 'Política SELECT para addresses creada';
  ELSE
    RAISE NOTICE 'Política SELECT para addresses ya existe';
  END IF;
END $$;

-- Política para INSERT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'addresses' 
    AND policyname = 'Usuarios pueden crear direcciones en su empresa'
  ) THEN
    CREATE POLICY "Usuarios pueden crear direcciones en su empresa"
    ON addresses FOR INSERT
    TO authenticated
    WITH CHECK (
      company_id IN (
        SELECT company_id 
        FROM user_companies 
        WHERE user_id = auth.uid()
      )
    );
    
    RAISE NOTICE 'Política INSERT para addresses creada';
  ELSE
    RAISE NOTICE 'Política INSERT para addresses ya existe';
  END IF;
END $$;

-- Política para UPDATE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'addresses' 
    AND policyname = 'Usuarios pueden actualizar direcciones de su empresa'
  ) THEN
    CREATE POLICY "Usuarios pueden actualizar direcciones de su empresa"
    ON addresses FOR UPDATE
    TO authenticated
    USING (
      company_id IN (
        SELECT company_id 
        FROM user_companies 
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      company_id IN (
        SELECT company_id 
        FROM user_companies 
        WHERE user_id = auth.uid()
      )
    );
    
    RAISE NOTICE 'Política UPDATE para addresses creada';
  ELSE
    RAISE NOTICE 'Política UPDATE para addresses ya existe';
  END IF;
END $$;

-- =====================================================
-- 8. TEST DE CONSULTA (REEMPLAZAR company_id)
-- =====================================================

-- IMPORTANTE: Reemplazar 'TU-COMPANY-ID-AQUI' con un company_id real
-- SELECT 
--   c.*,
--   a.street,
--   a.city,
--   a.postal_code
-- FROM 
--   clients c
--   LEFT JOIN addresses a ON c.direccion_id = a.id
-- WHERE 
--   c.company_id = 'TU-COMPANY-ID-AQUI'
--   AND c.deleted_at IS NULL
-- LIMIT 5;

-- =====================================================
-- 9. VERIFICAR ÍNDICES
-- =====================================================

SELECT 
  tablename,
  indexname,
  indexdef
FROM 
  pg_indexes
WHERE 
  tablename IN ('clients', 'addresses')
  AND schemaname = 'public'
ORDER BY 
  tablename, indexname;

-- =====================================================
-- 10. CREAR ÍNDICES SI FALTAN (PERFORMANCE)
-- =====================================================

-- Índice en clients.company_id
CREATE INDEX IF NOT EXISTS idx_clients_company_id 
ON clients(company_id);

-- Índice en clients.direccion_id
CREATE INDEX IF NOT EXISTS idx_clients_direccion_id 
ON clients(direccion_id);

-- Índice en clients.deleted_at (para filtrar activos)
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at 
ON clients(deleted_at);

-- Índice en addresses.company_id
CREATE INDEX IF NOT EXISTS idx_addresses_company_id 
ON addresses(company_id);

-- Índice compuesto para queries comunes
CREATE INDEX IF NOT EXISTS idx_clients_company_deleted 
ON clients(company_id, deleted_at);

-- =====================================================
-- 11. VERIFICACIÓN FINAL
-- =====================================================

SELECT 
  '✅ Verificación completada' AS status,
  (SELECT COUNT(*) FROM clients) AS total_clients,
  (SELECT COUNT(*) FROM addresses) AS total_addresses,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'clients') AS policies_clients,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'addresses') AS policies_addresses,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'clients' AND schemaname = 'public') AS indexes_clients,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'addresses' AND schemaname = 'public') AS indexes_addresses;

-- =====================================================
-- NOTAS IMPORTANTES:
-- =====================================================
-- 1. Ejecutar cada sección paso a paso
-- 2. Revisar los resultados antes de continuar
-- 3. Si hay errores, copiarlos para debugging
-- 4. Backup recomendado antes de ejecutar
-- =====================================================
