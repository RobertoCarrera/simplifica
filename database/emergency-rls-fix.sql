-- ========================================
-- CORRECCIÓN URGENTE DE POLÍTICAS RLS - PARA EJECUTAR EN SUPABASE
-- ========================================

-- PASO 1: Eliminar todas las políticas problemáticas de companies
DROP POLICY IF EXISTS "companies_user_company_select" ON public.companies;
DROP POLICY IF EXISTS "companies_user_company_update" ON public.companies;
DROP POLICY IF EXISTS "companies_owner_delete" ON public.companies;
DROP POLICY IF EXISTS "companies_allow_authenticated_insert" ON public.companies;
DROP POLICY IF EXISTS "companies_tenant_isolation" ON public.companies;
DROP POLICY IF EXISTS "companies_user_access" ON public.companies;
DROP POLICY IF EXISTS "Users can view their own company" ON public.companies;
DROP POLICY IF EXISTS "Users can update their own company" ON public.companies;

-- PASO 2: Crear política permisiva para INSERT (CRÍTICO para registro)
CREATE POLICY "companies_allow_insert_authenticated" 
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (true);

-- PASO 3: Política para SELECT
CREATE POLICY "companies_select_own" 
ON public.companies
FOR SELECT
TO authenticated
USING (
    id IN (
        SELECT DISTINCT u.company_id 
        FROM public.users u 
        WHERE u.auth_user_id = auth.uid()
    )
);

-- PASO 4: Política para UPDATE
CREATE POLICY "companies_update_admin" 
ON public.companies
FOR UPDATE
TO authenticated
USING (
    id IN (
        SELECT DISTINCT u.company_id 
        FROM public.users u 
        WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin', 'owner')
    )
)
WITH CHECK (
    id IN (
        SELECT DISTINCT u.company_id 
        FROM public.users u 
        WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin', 'owner')
    )
);

-- PASO 5: Arreglar políticas de USERS también
DROP POLICY IF EXISTS "users_allow_own_insert" ON public.users;
DROP POLICY IF EXISTS "users_company_select" ON public.users;
DROP POLICY IF EXISTS "users_update_own_or_admin" ON public.users;
DROP POLICY IF EXISTS "users_owner_delete" ON public.users;
DROP POLICY IF EXISTS "users_company_access" ON public.users;
DROP POLICY IF EXISTS "users_tenant_isolation" ON public.users;
DROP POLICY IF EXISTS "Users can view users from their company" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;

-- Política permisiva para INSERT en users
CREATE POLICY "users_insert_own" 
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = auth.uid());

-- Política para SELECT en users
CREATE POLICY "users_select_company" 
ON public.users
FOR SELECT
TO authenticated
USING (
    company_id IN (
        SELECT DISTINCT u.company_id 
        FROM public.users u 
        WHERE u.auth_user_id = auth.uid()
    )
);

-- PASO 6: Verificar que RLS está habilitado
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- PASO 7: Mostrar políticas aplicadas
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    cmd
FROM pg_policies 
WHERE tablename IN ('companies', 'users')
ORDER BY tablename, cmd;
