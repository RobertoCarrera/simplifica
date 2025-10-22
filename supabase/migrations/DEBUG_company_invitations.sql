-- ========================================
-- SCRIPT DE VERIFICACIÓN Y DEBUG
-- ========================================
-- Ejecuta estos comandos para verificar el estado

-- 1. Ver estructura de company_invitations
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'company_invitations'
ORDER BY ordinal_position;

-- 2. Ver constraints (incluyendo CHECK de role)
SELECT 
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'company_invitations'
ORDER BY con.conname;

-- 3. Ver todas las políticas RLS actuales
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive,
    roles,
    cmd,
    qual AS using_expression,
    with_check AS check_expression
FROM pg_policies
WHERE tablename = 'company_invitations'
ORDER BY cmd, policyname;

-- 4. Verificar si RLS está habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE tablename = 'company_invitations';

-- 5. Ver invitaciones existentes (si las hay)
SELECT 
    id,
    email,
    role,
    status,
    token,
    created_at,
    expires_at
FROM company_invitations
ORDER BY created_at DESC
LIMIT 10;

-- 6. Intentar crear una invitación de prueba (comenta esto si no quieres crear datos de prueba)
/*
INSERT INTO company_invitations (
    company_id,
    email,
    invited_by_user_id,
    role,
    status,
    token,
    expires_at
) VALUES (
    (SELECT id FROM companies LIMIT 1),
    'test@example.com',
    (SELECT id FROM users WHERE role = 'owner' LIMIT 1),
    'client',
    'pending',
    gen_random_uuid()::text,
    now() + interval '7 days'
) RETURNING *;
*/
