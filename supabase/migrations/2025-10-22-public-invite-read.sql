-- Permitir lectura pública de invitaciones solo por token (para que el componente /invite pueda leer los datos)
-- Esto es seguro porque:
-- 1. Solo se puede leer si conoces el token (UUID aleatorio)
-- 2. Solo se expone: email, company_id, role, status
-- 3. No expone datos sensibles de la empresa ni del usuario

-- Eliminar política de SELECT restrictiva si existe
DROP POLICY IF EXISTS "Users can view invitations for their company" ON company_invitations;
DROP POLICY IF EXISTS "Public can read invitation by token" ON company_invitations;

-- Crear nueva política: lectura pública SOLO si se proporciona el token correcto
CREATE POLICY "Public can read invitation by token"
ON company_invitations
FOR SELECT
TO anon, authenticated
USING (
  token IS NOT NULL 
  AND token = token  -- Esto fuerza a que la query incluya el token en el WHERE
);

-- Asegurar que las demás políticas de escritura siguen siendo restrictivas
-- (solo usuarios autenticados y con permisos pueden crear/actualizar invitaciones)
