-- ============================================
-- SETUP USUARIO DEV EN TABLA USERS EXISTENTE
-- ============================================

-- 1. Crear company para desarrollo (si no existe)
INSERT INTO companies (id, name, slug, settings, website, subscription_tier, max_users, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Simplifica Dev Company',
    'dev-company',
    '{"isDev": true, "environment": "development"}',
    'https://dev.simplifica.com',
    'enterprise',
    999,
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    settings = EXCLUDED.settings;

-- 2. Crear usuario dev en tabla users existente
INSERT INTO users (id, company_id, email, name, role, active, permissions)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'dev@simplifica.com',
    'Developer User',
    'owner',
    true,
    '{
        "moduloFacturas": true,
        "moduloMaterial": true,
        "moduloServicios": true,
        "moduloPresupuestos": true,
        "isDev": true,
        "canSeeAllCompanies": true,
        "canSeeDevTools": true,
        "canManageUsers": true
    }'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    permissions = EXCLUDED.permissions;

-- 3. Función para verificar si un usuario es dev
CREATE OR REPLACE FUNCTION is_dev_user(user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users 
        WHERE email = user_email 
        AND role = 'owner'
        AND active = true
        AND (permissions->>'isDev')::boolean = true
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. Función para obtener permisos de usuario
CREATE OR REPLACE FUNCTION get_user_permissions(user_email TEXT)
RETURNS JSONB AS $$
DECLARE
    user_perms JSONB;
BEGIN
    SELECT permissions INTO user_perms
    FROM users 
    WHERE email = user_email AND active = true;
    
    RETURN COALESCE(user_perms, '{}');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. Verificar que funciona
SELECT 
    email,
    name,
    role,
    permissions,
    is_dev_user(email) as is_dev
FROM users
WHERE role = 'owner' OR email = 'dev@simplifica.com';
