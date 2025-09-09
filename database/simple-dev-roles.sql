-- ============================================
-- SETUP SIMPLE DE ROLES PARA DEV/PRODUCCIÓN
-- ============================================

-- Crear tabla de roles de sistema
CREATE TABLE IF NOT EXISTS system_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR NOT NULL UNIQUE,
    role VARCHAR NOT NULL DEFAULT 'user',
    permissions JSONB DEFAULT '{}',
    is_dev BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar usuario DEV que puede ver todo
INSERT INTO system_roles (email, role, is_dev, permissions) VALUES 
('dev@simplifica.com', 'superadmin', true, '{
    "canSeeAll": true,
    "canManageUsers": true,
    "canSeeDevTools": true,
    "canAccessAllCompanies": true
}')
ON CONFLICT (email) DO UPDATE SET
    role = EXCLUDED.role,
    is_dev = EXCLUDED.is_dev,
    permissions = EXCLUDED.permissions;

-- Función para verificar si un usuario es dev
CREATE OR REPLACE FUNCTION is_dev_user(user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM system_roles 
        WHERE email = user_email 
        AND is_dev = true 
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Función para obtener permisos de usuario
CREATE OR REPLACE FUNCTION get_user_permissions(user_email TEXT)
RETURNS JSONB AS $$
DECLARE
    user_perms JSONB;
BEGIN
    SELECT permissions INTO user_perms
    FROM system_roles 
    WHERE email = user_email AND is_active = true;
    
    RETURN COALESCE(user_perms, '{}');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Verificar que funciona
SELECT 
    email,
    role,
    is_dev,
    permissions,
    is_dev_user(email) as can_see_dev_tools
FROM system_roles;
