-- ========================================
-- SCRIPT COMPLETO PARA PORTAL DE CLIENTES
-- ========================================
-- Ejecutar este script en Supabase Dashboard → SQL Editor
-- ========================================

-- 1. PERMITIR ROLES 'none' Y 'client' EN USUARIOS
-- ========================================
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
  CHECK (role IN ('none', 'client', 'member', 'admin', 'owner'));

-- 2. PERMITIR ROL 'client' EN INVITACIONES
-- ========================================
ALTER TABLE company_invitations DROP CONSTRAINT IF EXISTS company_invitations_role_check;
ALTER TABLE company_invitations ADD CONSTRAINT company_invitations_role_check 
  CHECK (role IN ('client', 'member', 'admin', 'owner'));

-- 3. PERMITIR LECTURA PÚBLICA DE INVITACIONES POR TOKEN
-- ========================================
-- Esto permite que el componente /invite pueda leer los datos de la invitación
-- sin necesidad de estar autenticado (solo con el token de la URL)

DROP POLICY IF EXISTS "Users can view invitations for their company" ON company_invitations;
DROP POLICY IF EXISTS "Public can read invitation by token" ON company_invitations;
DROP POLICY IF EXISTS "Service role can insert invitations" ON company_invitations;
DROP POLICY IF EXISTS "Service role can update invitations" ON company_invitations;
DROP POLICY IF EXISTS "Users can accept their own invitation" ON company_invitations;
DROP POLICY IF EXISTS "Company admins can delete invitations" ON company_invitations;

-- LECTURA: Pública (cualquiera con el link puede leer)
CREATE POLICY "Public can read invitation by token"
ON company_invitations 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- INSERCIÓN: Solo Service Role (Edge Functions)
CREATE POLICY "Service role can insert invitations"
ON company_invitations
FOR INSERT
TO service_role
WITH CHECK (true);

-- ACTUALIZACIÓN: Service Role + usuarios aceptando su propia invitación
CREATE POLICY "Service role can update invitations"
ON company_invitations
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can accept their own invitation"
ON company_invitations
FOR UPDATE
TO authenticated
USING (
  lower(email) = lower(((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'email'::text))
  AND status = 'pending'
)
WITH CHECK (
  status IN ('accepted', 'rejected')
);

-- ELIMINACIÓN: Solo admins de la empresa
CREATE POLICY "Company admins can delete invitations"
ON company_invitations
FOR DELETE
TO authenticated
USING (
  company_id = get_user_company_id()
  AND EXISTS (
    SELECT 1 FROM users 
    WHERE users.auth_user_id = auth.uid()
    AND users.company_id = company_invitations.company_id
    AND users.role IN ('owner', 'admin')
  )
);

-- 4. VERIFICAR CONFIGURACIÓN
-- ========================================
-- Ejecuta estas queries para verificar que todo está correcto:

-- Ver constraints actuales de users:
-- SELECT con.conname, pg_get_constraintdef(con.oid)
-- FROM pg_constraint con
-- WHERE con.conrelid = 'users'::regclass AND con.conname LIKE '%role%';

-- Ver constraints actuales de company_invitations:
-- SELECT con.conname, pg_get_constraintdef(con.oid)
-- FROM pg_constraint con
-- WHERE con.conrelid = 'company_invitations'::regclass AND con.conname LIKE '%role%';

-- Ver políticas de company_invitations:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'company_invitations';

-- ========================================
-- FIN DEL SCRIPT
-- ========================================
-- Si todo ha ido bien, deberías ver:
-- 1. users con roles: none, client, member, admin, owner
-- 2. company_invitations con roles: client, member, admin, owner
-- 3. Política de lectura pública en company_invitations
-- ========================================
