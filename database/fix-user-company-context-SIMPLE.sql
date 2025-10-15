-- ============================================================================
-- FIX RÁPIDO: Restaurar user_company_context a definición original
-- ============================================================================
-- PROBLEMA: La vista modificada tenía JOIN con companies → dependencia circular
-- SOLUCIÓN: Volver a definición original (sin JOIN, solo 3 columnas)
-- ============================================================================

-- 1. RESTAURAR user_company_context (SIN JOIN a companies)
DROP VIEW IF EXISTS user_company_context CASCADE;

CREATE OR REPLACE VIEW user_company_context AS
SELECT 
  auth.uid() as auth_user_id,
  u.company_id,
  u.role
FROM public.users u
WHERE u.auth_user_id = auth.uid();

-- 2. RESTAURAR users_with_company (puede usar JOIN porque no la usan las políticas RLS)
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

-- 3. VERIFICAR (simple)
SELECT 
    'user_company_context' as vista,
    COUNT(*) as records
FROM user_company_context;

SELECT 
    'Test clientes' as test,
    COUNT(*) as records
FROM clients
WHERE deleted_at IS NULL;

SELECT 
    'Test servicios' as test,
    COUNT(*) as records
FROM services
WHERE deleted_at IS NULL;

SELECT 
    'Test tickets' as test,
    COUNT(*) as records
FROM tickets;

-- ============================================================================
-- LISTO! Ahora refresca el navegador (F5) y deberías ver los datos
-- ============================================================================
