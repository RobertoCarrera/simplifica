-- ============================================
-- SETUP DE INVITACIONES Y EMAIL TEMPLATES
-- ============================================

-- 1. Verificar configuración de Email Templates en Supabase
-- Ve a: Authentication > Email Templates > Invite user
-- Asegúrate de que el enlace sea: {{ .SiteURL }}/auth/callback?token={{ .Token }}&type=invite

-- 2. Función para invitar usuarios correctamente
CREATE OR REPLACE FUNCTION invite_user_to_company(
  user_email TEXT,
  user_name TEXT,
  user_role TEXT DEFAULT 'member',
  target_company_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  company_uuid UUID;
BEGIN
  -- Si no se especifica company_id, usar la primera empresa activa
  IF target_company_id IS NULL THEN
    SELECT id INTO company_uuid 
    FROM companies 
    WHERE is_active = true 
    ORDER BY created_at 
    LIMIT 1;
  ELSE
    company_uuid := target_company_id;
  END IF;
  
  -- Verificar que la empresa existe
  IF company_uuid IS NULL THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'No se encontró una empresa válida'
    );
  END IF;
  
  -- Verificar que el rol es válido
  IF user_role NOT IN ('owner', 'admin', 'member') THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Rol inválido. Debe ser: owner, admin, o member'
    );
  END IF;
  
  -- Crear entrada en users (sin auth_user_id, se creará cuando acepte la invitación)
  INSERT INTO users (
    company_id, 
    email, 
    name, 
    role, 
    active,
    permissions
  ) VALUES (
    company_uuid,
    user_email,
    user_name,
    user_role,
    false, -- Inactivo hasta que acepte la invitación
    CASE 
      WHEN user_role = 'owner' THEN '{"canManageUsers": true, "canSeeAllData": true}'::jsonb
      WHEN user_role = 'admin' THEN '{"canManageUsers": true, "canSeeCompanyData": true}'::jsonb
      ELSE '{}'::jsonb
    END
  )
  ON CONFLICT (email, company_id) 
  DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    permissions = EXCLUDED.permissions;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Usuario preparado para invitación',
    'company_id', company_uuid,
    'email', user_email,
    'role', user_role
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Función para activar usuario cuando acepta invitación
CREATE OR REPLACE FUNCTION activate_invited_user(
  auth_user_id UUID,
  user_email TEXT
)
RETURNS JSON AS $$
DECLARE
  user_record RECORD;
BEGIN
  -- Buscar el usuario por email
  SELECT * INTO user_record
  FROM users 
  WHERE email = user_email 
  AND active = false
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Usuario no encontrado o ya está activo'
    );
  END IF;
  
  -- Activar usuario y asociar con auth_user_id
  UPDATE users 
  SET 
    auth_user_id = activate_invited_user.auth_user_id,
    active = true,
    updated_at = NOW()
  WHERE id = user_record.id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Usuario activado correctamente',
    'user_id', user_record.id,
    'company_id', user_record.company_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Ejemplo de uso - Invitar un usuario
-- SELECT invite_user_to_company('nuevo@empresa.com', 'Nuevo Usuario', 'member');

-- 5. Trigger para auto-activar usuarios cuando se registran en auth.users
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Buscar si este email ya está en users (invitado)
  UPDATE users 
  SET 
    auth_user_id = NEW.id,
    active = true,
    updated_at = NOW()
  WHERE 
    email = NEW.email 
    AND auth_user_id IS NULL 
    AND active = false;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger si no existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
