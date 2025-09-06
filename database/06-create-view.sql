-- Crear vista para usuarios con información de empresa
CREATE OR REPLACE VIEW users_with_company AS
SELECT 
    u.id,
    u.email,
    u.full_name,
    u.permissions,
    u.created_at as user_created_at,
    c.id as company_id,
    c.name as company_name,
    c.website as company_website,
    c.legacy_negocio_id
FROM users u
JOIN companies c ON u.company_id = c.id
WHERE u.deleted_at IS NULL 
AND c.deleted_at IS NULL;
