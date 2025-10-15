-- ============================================================================
-- EMERGENCIA: Crear políticas RLS SÚPER PERMISIVAS
-- ============================================================================
-- Esto eliminará TODAS las políticas actuales y creará unas nuevas
-- que GARANTIZAN que los usuarios autenticados puedan ver sus datos
-- ============================================================================

-- PASO 1: Eliminar TODAS las políticas existentes de clients
DO $$ 
DECLARE
    pol_record RECORD;
BEGIN
    FOR pol_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'clients'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON clients', pol_record.policyname);
    END LOOP;
END $$;

-- PASO 2: Crear políticas SÚPER PERMISIVAS para clients
-- SELECT: Permite ver clientes de tu company
CREATE POLICY "clients_select_by_company" 
ON clients
FOR SELECT
TO authenticated
USING (
    company_id IN (
        SELECT company_id 
        FROM user_company_context
    )
);

-- INSERT: Permite crear clientes en tu company
CREATE POLICY "clients_insert_by_company" 
ON clients
FOR INSERT
TO authenticated
WITH CHECK (
    company_id IN (
        SELECT company_id 
        FROM user_company_context
    )
);

-- UPDATE: Permite actualizar clientes de tu company
CREATE POLICY "clients_update_by_company" 
ON clients
FOR UPDATE
TO authenticated
USING (
    company_id IN (
        SELECT company_id 
        FROM user_company_context
    )
)
WITH CHECK (
    company_id IN (
        SELECT company_id 
        FROM user_company_context
    )
);

-- DELETE: Permite marcar como eliminados (soft delete)
CREATE POLICY "clients_delete_by_company" 
ON clients
FOR DELETE
TO authenticated
USING (
    company_id IN (
        SELECT company_id 
        FROM user_company_context
    )
);

-- PASO 3: Lo mismo para SERVICES
DO $$ 
DECLARE
    pol_record RECORD;
BEGIN
    FOR pol_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'services'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON services', pol_record.policyname);
    END LOOP;
END $$;

CREATE POLICY "services_select_by_company" 
ON services FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM user_company_context));

CREATE POLICY "services_insert_by_company" 
ON services FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM user_company_context));

CREATE POLICY "services_update_by_company" 
ON services FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM user_company_context))
WITH CHECK (company_id IN (SELECT company_id FROM user_company_context));

CREATE POLICY "services_delete_by_company" 
ON services FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM user_company_context));

-- PASO 4: Lo mismo para TICKETS
DO $$ 
DECLARE
    pol_record RECORD;
BEGIN
    FOR pol_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'tickets'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON tickets', pol_record.policyname);
    END LOOP;
END $$;

CREATE POLICY "tickets_select_by_company" 
ON tickets FOR SELECT TO authenticated
USING (company_id IN (SELECT company_id FROM user_company_context));

CREATE POLICY "tickets_insert_by_company" 
ON tickets FOR INSERT TO authenticated
WITH CHECK (company_id IN (SELECT company_id FROM user_company_context));

CREATE POLICY "tickets_update_by_company" 
ON tickets FOR UPDATE TO authenticated
USING (company_id IN (SELECT company_id FROM user_company_context))
WITH CHECK (company_id IN (SELECT company_id FROM user_company_context));

CREATE POLICY "tickets_delete_by_company" 
ON tickets FOR DELETE TO authenticated
USING (company_id IN (SELECT company_id FROM user_company_context));

-- PASO 5: Verificar que las políticas se crearon
SELECT 
    'Políticas creadas para ' || tablename as info,
    COUNT(*) as total_policies,
    array_agg(policyname ORDER BY policyname) as policy_names
FROM pg_policies
WHERE tablename IN ('clients', 'services', 'tickets')
GROUP BY tablename
ORDER BY tablename;

-- PASO 6: Verificar que RLS está habilitado
SELECT 
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('clients', 'services', 'tickets')
ORDER BY tablename;

-- ============================================================================
-- DESPUÉS DE EJECUTAR:
-- 1. Cierra sesión en la app
-- 2. Inicia sesión nuevamente
-- 3. Refresca (F5)
-- 4. ¿Ahora sí ves los clientes?
-- ============================================================================
