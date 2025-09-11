-- ========================================
-- CORRECCIÓN SIMPLE Y DIRECTA DE RLS
-- ========================================

-- PASO 1: ELIMINAR TODAS las políticas de companies
DO $$ 
DECLARE 
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'companies' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.companies', policy_record.policyname);
    END LOOP;
END $$;

-- PASO 2: ELIMINAR TODAS las políticas de users
DO $$ 
DECLARE 
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'users' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', policy_record.policyname);
    END LOOP;
END $$;

-- PASO 3: Crear políticas SÚPER PERMISIVAS para companies
CREATE POLICY "allow_all_for_companies" 
ON public.companies
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- PASO 4: Crear políticas SÚPER PERMISIVAS para users
CREATE POLICY "allow_all_for_users" 
ON public.users
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- PASO 5: Verificar que RLS está habilitado
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- PASO 6: Verificar las políticas aplicadas
SELECT 
    tablename, 
    policyname, 
    cmd,
    permissive
FROM pg_policies 
WHERE tablename IN ('companies', 'users') AND schemaname = 'public'
ORDER BY tablename, policyname;
