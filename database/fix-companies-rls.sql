-- ========================================
-- CORRECCIÓN DE POLÍTICAS RLS PARA COMPANIES Y USERS
-- ========================================

-- PROBLEMA: Las políticas RLS de companies están bloqueando la creación 
-- de nuevas empresas durante el registro de usuarios

-- PASO 1: Crear vista auxiliar necesaria para algunas políticas
CREATE OR REPLACE VIEW user_company_context AS
SELECT DISTINCT 
    u.auth_user_id,
    u.company_id,
    u.role,
    c.name as company_name
FROM users u
JOIN companies c ON u.company_id = c.id
WHERE u.auth_user_id = auth.uid()
  AND u.active = true;

-- PASO 2: Verificar políticas actuales
-- Ver las políticas actuales
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'companies';

-- Eliminar políticas existentes que puedan estar causando problemas
DROP POLICY IF EXISTS "Users can view their own company" ON public.companies;
DROP POLICY IF EXISTS "Users can update their own company" ON public.companies;
DROP POLICY IF EXISTS "companies_tenant_isolation" ON public.companies;
DROP POLICY IF EXISTS "companies_user_access" ON public.companies;

-- NUEVA POLÍTICA PERMISIVA PARA COMPANIES
-- Permite que los usuarios autenticados puedan:
-- 1. Crear nuevas empresas (durante registro)
-- 2. Ver/editar empresas donde tienen acceso

-- Política para INSERT - Permitir a usuarios autenticados crear empresas
CREATE POLICY "companies_allow_authenticated_insert" 
ON public.companies
FOR INSERT
TO authenticated
WITH CHECK (true);  -- Cualquier usuario autenticado puede crear una empresa

-- Política para SELECT - Ver empresas donde el usuario tiene acceso
CREATE POLICY "companies_user_company_select" 
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

-- Política para UPDATE - Actualizar solo empresas donde el usuario tiene acceso
CREATE POLICY "companies_user_company_update" 
ON public.companies
FOR UPDATE
TO authenticated
USING (
    id IN (
        SELECT DISTINCT u.company_id 
        FROM public.users u 
        WHERE u.auth_user_id = auth.uid()
        AND u.role IN ('admin', 'owner')  -- Solo admin/owner pueden editar empresa
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

-- Política para DELETE - Solo owners pueden eliminar empresas
CREATE POLICY "companies_owner_delete" 
ON public.companies
FOR DELETE
TO authenticated
USING (
    id IN (
        SELECT DISTINCT u.company_id 
        FROM public.users u 
        WHERE u.auth_user_id = auth.uid()
        AND u.role = 'owner'
    )
);

-- VERIFICAR QUE RLS ESTÉ HABILITADO
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Verificar las nuevas políticas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'companies'
ORDER BY cmd, policyname;

-- ========================================
-- CORRECCIÓN DE POLÍTICAS RLS PARA USERS
-- ========================================

-- Ver las políticas actuales de users
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'users';

-- Eliminar políticas existentes problemáticas
DROP POLICY IF EXISTS "Users can view users from their company" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "users_company_access" ON public.users;
DROP POLICY IF EXISTS "users_tenant_isolation" ON public.users;

-- NUEVA POLÍTICA PERMISIVA PARA USERS
-- Permite que los usuarios autenticados puedan:
-- 1. Crear su propio perfil durante el registro
-- 2. Ver/editar usuarios de su empresa

-- Política para INSERT - Permitir crear perfil propio
CREATE POLICY "users_allow_own_insert" 
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth_user_id = auth.uid());

-- Política para SELECT - Ver usuarios de la misma empresa
CREATE POLICY "users_company_select" 
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

-- Política para UPDATE - Actualizar solo el propio perfil o si es admin
CREATE POLICY "users_update_own_or_admin" 
ON public.users
FOR UPDATE
TO authenticated
USING (
    auth_user_id = auth.uid()  -- Propio perfil
    OR 
    (
        company_id IN (
            SELECT u.company_id 
            FROM public.users u 
            WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('admin', 'owner')
        )
    )
)
WITH CHECK (
    auth_user_id = auth.uid()  -- Propio perfil
    OR 
    (
        company_id IN (
            SELECT u.company_id 
            FROM public.users u 
            WHERE u.auth_user_id = auth.uid()
            AND u.role IN ('admin', 'owner')
        )
    )
);

-- Política para DELETE - Solo owners pueden eliminar usuarios
CREATE POLICY "users_owner_delete" 
ON public.users
FOR DELETE
TO authenticated
USING (
    company_id IN (
        SELECT u.company_id 
        FROM public.users u 
        WHERE u.auth_user_id = auth.uid()
        AND u.role = 'owner'
    )
    AND auth_user_id != auth.uid()  -- No puede eliminarse a sí mismo
);

-- VERIFICAR QUE RLS ESTÉ HABILITADO
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Verificar las nuevas políticas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY cmd, policyname;

-- ========================================
-- TESTING Y VERIFICACIÓN
-- ========================================

-- TEST: Verificar que un usuario autenticado puede insertar empresa
-- Esto debería funcionar ahora:
-- INSERT INTO public.companies (name, slug) VALUES ('Test Company', 'test-company');

-- TEST: Verificar que puede crear su perfil de usuario
-- INSERT INTO public.users (email, name, role, active, company_id, auth_user_id) 
-- VALUES ('test@example.com', 'Test User', 'owner', true, 'company-id', auth.uid());

-- ========================================
-- SOLUCIÓN ADICIONAL: VERIFICAR TABLAS EXISTENTES
-- ========================================

-- Asegurarse de que las tablas tengan las columnas correctas
-- (por si hay inconsistencias de esquema)

-- Verificar estructura de companies
\d public.companies;

-- Verificar estructura de users  
\d public.users;

-- Si hay problemas de esquema, descomentar estas líneas:
-- ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS name text NOT NULL;
-- ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug text;
-- ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text NOT NULL;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name text;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text DEFAULT 'member';
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id);
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}';

-- ========================================
-- FINALIZACIÓN
-- ========================================

-- Mostrar todas las políticas activas para verificar
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    permissive, 
    roles, 
    cmd,
    substring(qual from 1 for 50) as using_clause,
    substring(with_check from 1 for 50) as with_check_clause
FROM pg_policies 
WHERE tablename IN ('companies', 'users')
ORDER BY tablename, cmd, policyname;
