-- ============================================================================
-- FIX DEFINITIVO: Corregir user_company_context y re-habilitar RLS
-- ============================================================================
-- PROBLEMA: La vista user_company_context tiene columnas sin prefijo de tabla
-- SOLUCIÓN: Recrear vista con sintaxis correcta y re-habilitar RLS
-- ============================================================================

-- PASO 1: Recrear user_company_context CON PREFIJOS CORRECTOS
DROP VIEW IF EXISTS user_company_context CASCADE;

CREATE OR REPLACE VIEW user_company_context AS
SELECT 
  auth.uid() as auth_user_id,
  u.company_id,
  u.role
FROM public.users u
WHERE u.auth_user_id = auth.uid();

COMMENT ON VIEW user_company_context IS 
'Vista de contexto del usuario autenticado. Devuelve company_id y role del usuario actual.';

-- PASO 2: Recrear users_with_company
DROP VIEW IF EXISTS users_with_company CASCADE;

CREATE VIEW users_with_company AS
SELECT 
    u.id,
    u.email,
    u.name,
    u.surname,
    u.permissions,
    u.created_at as user_created_at,
    c.id as company_id,
    c.name as company_name,
    c.website as company_website,
    c.legacy_negocio_id
FROM users u
JOIN companies c ON u.company_id = c.id
WHERE u.deleted_at IS NULL 
AND c.deleted_at IS NULL
AND u.company_id IN (
    SELECT company_id FROM user_company_context
);

-- PASO 3: Verificar que la vista funciona correctamente
SELECT 
    'Test 1: Definición de user_company_context' as test,
    pg_get_viewdef('user_company_context'::regclass, true) as definition;

-- PASO 4: RE-HABILITAR RLS en clients, services y tickets
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- PASO 5: Verificar que RLS está habilitado
SELECT 
    'Test 2: RLS habilitado' as test,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename IN ('clients', 'services', 'tickets')
ORDER BY tablename;

-- PASO 6: Test final - simular query de usuario autenticado
-- (Este test fallará en SQL Editor porque auth.uid() es NULL aquí)
-- Pero funcionará correctamente desde la aplicación
SELECT 
    'Test 3: Simulación user_company_context' as test,
    auth_user_id,
    company_id,
    role
FROM (
    SELECT 
        u.auth_user_id,
        u.company_id,
        u.role
    FROM public.users u
    WHERE u.auth_user_id = '84efaa41-9734-4410-b0f2-9101e225ce0c'::uuid
) as simulated;

-- ============================================================================
-- INSTRUCCIONES DESPUÉS DE EJECUTAR:
-- ============================================================================
-- 1. Ejecuta este script completo
-- 2. Cierra sesión en la aplicación
-- 3. Vuelve a iniciar sesión
-- 4. Refresca el navegador (F5)
-- 5. Deberías ver tus clientes, servicios y tickets
-- 
-- Si todavía no funciona, ejecuta el siguiente script de diagnóstico
-- ============================================================================
