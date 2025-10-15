-- ============================================================================
-- CREAR POLÍTICAS RLS FALTANTES PARA CLIENTS, SERVICES Y TICKETS
-- ============================================================================
-- PROBLEMA: Las tablas tienen RLS habilitado pero NO tienen políticas
-- SOLUCIÓN: Crear políticas básicas que permitan acceso por company_id
-- ============================================================================

-- VERIFICAR: ¿Existe la función get_user_company_id()?
SELECT 
    'Verificando función get_user_company_id' as test,
    proname,
    pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE proname = 'get_user_company_id'
LIMIT 1;

-- Si no existe, crearla
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN (
    SELECT company_id 
    FROM user_company_context 
    LIMIT 1
  );
END;
$$;

-- ============================================================================
-- POLÍTICAS PARA CLIENTS
-- ============================================================================

-- SELECT: Ver clientes de tu company
CREATE POLICY "clients_select_company_only" 
ON clients
FOR SELECT
TO public
USING (
    company_id = get_user_company_id()
);

-- INSERT: Crear clientes en tu company
CREATE POLICY "clients_insert_company_only" 
ON clients
FOR INSERT
TO public
WITH CHECK (
    company_id = get_user_company_id()
);

-- UPDATE: Actualizar clientes de tu company
CREATE POLICY "clients_update_company_only" 
ON clients
FOR UPDATE
TO public
USING (
    company_id = get_user_company_id()
)
WITH CHECK (
    company_id = get_user_company_id()
);

-- DELETE: Eliminar clientes de tu company
CREATE POLICY "clients_delete_company_only" 
ON clients
FOR DELETE
TO public
USING (
    company_id = get_user_company_id()
);

-- ============================================================================
-- POLÍTICAS PARA SERVICES
-- ============================================================================

-- SELECT: Ver servicios de tu company
CREATE POLICY "services_select_company_only" 
ON services
FOR SELECT
TO public
USING (
    company_id = get_user_company_id()
);

-- INSERT: Crear servicios en tu company
CREATE POLICY "services_insert_company_only" 
ON services
FOR INSERT
TO public
WITH CHECK (
    company_id = get_user_company_id()
);

-- UPDATE: Actualizar servicios de tu company
CREATE POLICY "services_update_company_only" 
ON services
FOR UPDATE
TO public
USING (
    company_id = get_user_company_id()
)
WITH CHECK (
    company_id = get_user_company_id()
);

-- DELETE: Eliminar servicios de tu company
CREATE POLICY "services_delete_company_only" 
ON services
FOR DELETE
TO public
USING (
    company_id = get_user_company_id()
);

-- ============================================================================
-- POLÍTICAS PARA TICKETS
-- ============================================================================

-- SELECT: Ver tickets de tu company
CREATE POLICY "tickets_select_company_only" 
ON tickets
FOR SELECT
TO public
USING (
    company_id = get_user_company_id()
);

-- INSERT: Crear tickets en tu company
CREATE POLICY "tickets_insert_company_only" 
ON tickets
FOR INSERT
TO public
WITH CHECK (
    company_id = get_user_company_id()
);

-- UPDATE: Actualizar tickets de tu company
CREATE POLICY "tickets_update_company_only" 
ON tickets
FOR UPDATE
TO public
USING (
    company_id = get_user_company_id()
)
WITH CHECK (
    company_id = get_user_company_id()
);

-- DELETE: Eliminar tickets de tu company
CREATE POLICY "tickets_delete_company_only" 
ON tickets
FOR DELETE
TO public
USING (
    company_id = get_user_company_id()
);

-- ============================================================================
-- VERIFICAR QUE SE CREARON LAS POLÍTICAS
-- ============================================================================

SELECT 
    'Políticas de CLIENTS' as tabla,
    COUNT(*) as total,
    array_agg(policyname ORDER BY policyname) as policies
FROM pg_policies
WHERE tablename = 'clients'
GROUP BY tablename;

SELECT 
    'Políticas de SERVICES' as tabla,
    COUNT(*) as total,
    array_agg(policyname ORDER BY policyname) as policies
FROM pg_policies
WHERE tablename = 'services'
GROUP BY tablename;

SELECT 
    'Políticas de TICKETS' as tabla,
    COUNT(*) as total,
    array_agg(policyname ORDER BY policyname) as policies
FROM pg_policies
WHERE tablename = 'tickets'
GROUP BY tablename;

-- ============================================================================
-- LISTO! Ahora:
-- 1. Cierra sesión
-- 2. Inicia sesión
-- 3. Refresca (F5)
-- 4. Deberías ver tus clientes, servicios y tickets
-- ============================================================================
