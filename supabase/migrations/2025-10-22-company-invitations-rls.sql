-- ========================================
-- POLÍTICAS RLS PARA COMPANY_INVITATIONS
-- ========================================

-- 1. LECTURA PÚBLICA POR TOKEN (para que /invite pueda leer sin autenticación)
DROP POLICY IF EXISTS "Public can read invitation by token" ON company_invitations;
CREATE POLICY "Public can read invitation by token"
ON company_invitations 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- 2. INSERCIÓN: Solo Service Role (Edge Functions) puede crear invitaciones
-- Las invitaciones se crean desde la Edge Function con SERVICE_ROLE_KEY
DROP POLICY IF EXISTS "Service role can insert invitations" ON company_invitations;
CREATE POLICY "Service role can insert invitations"
ON company_invitations
FOR INSERT
TO service_role
WITH CHECK (true);

-- 3. ACTUALIZACIÓN: Solo Service Role y Accept RPC pueden actualizar
DROP POLICY IF EXISTS "Service role can update invitations" ON company_invitations;
CREATE POLICY "Service role can update invitations"
ON company_invitations
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- También permitir actualización para usuarios autenticados que aceptan su propia invitación
DROP POLICY IF EXISTS "Users can accept their own invitation" ON company_invitations;
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

-- 4. ELIMINACIÓN: Solo admins de la empresa pueden eliminar invitaciones
DROP POLICY IF EXISTS "Company admins can delete invitations" ON company_invitations;
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

-- ========================================
-- VERIFICACIÓN
-- ========================================
-- Ejecuta esto para ver las políticas aplicadas:
/*
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'company_invitations'
ORDER BY cmd, policyname;
*/
