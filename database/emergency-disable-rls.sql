-- ================================================
-- EMERGENCY FIX: DISABLE RLS TEMPORARILY
-- ================================================
-- IMPORTANTE: Aplicar desde Supabase Dashboard > SQL Editor
-- Esto permite que la app funcione mientras arreglamos las políticas

-- 1. Eliminar todas las políticas problemáticas
DROP POLICY IF EXISTS companies_select_own ON public.companies;
DROP POLICY IF EXISTS companies_authenticated ON public.companies;
DROP POLICY IF EXISTS companies_insert_auth ON public.companies;
DROP POLICY IF EXISTS companies_update_auth ON public.companies;
DROP POLICY IF EXISTS users_select_self ON public.users;
DROP POLICY IF EXISTS users_update_self ON public.users;
DROP POLICY IF EXISTS users_insert_self ON public.users;
DROP POLICY IF EXISTS users_own_data ON public.users;
DROP POLICY IF EXISTS users_insert_own ON public.users;

-- 2. Deshabilitar RLS completamente (temporal)
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 3. Verificar estado
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'companies');

-- 4. Mensaje de confirmación
DO $$ 
BEGIN 
    RAISE NOTICE '🚨 RLS TEMPORARILY DISABLED';
    RAISE NOTICE '✅ App should work now';
    RAISE NOTICE '⚠️  Remember to re-enable RLS with proper policies later';
END $$;
