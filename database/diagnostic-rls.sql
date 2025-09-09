-- ================================================
-- DIAGNOSTIC SCRIPT - Current RLS Status
-- ================================================

-- Verificar políticas actuales
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'companies')
ORDER BY tablename, policyname;

-- Verificar si RLS está habilitado
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'companies');

-- Verificar estructura de tablas
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'companies')
ORDER BY table_name, ordinal_position;

-- Verificar datos existentes
SELECT 'users' as table_name, count(*) as records FROM public.users
UNION ALL
SELECT 'companies' as table_name, count(*) as records FROM public.companies;
