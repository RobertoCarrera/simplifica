-- Insert the missing public user linked to the manual Auth User
INSERT INTO "public"."users" (
    "id",
    "company_id",
    "email",
    "name",
    "role",
    "active",
    "auth_user_id",
    "permissions"
) VALUES (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', -- Fixed Public ID
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', -- Existing Company ID
    'robertocarreratech@gmail.com',
    'Roberto Carrera',
    'owner',
    true,
    '5ed72a2e-47dc-44db-9fcf-ad75760e8e58', -- The Auth ID you manually created
    '{"moduloFacturas": true, "moduloMaterial": true, "moduloServicios": true, "moduloPresupuestos": true}'::jsonb
) ON CONFLICT (email) DO UPDATE SET
    auth_user_id = EXCLUDED.auth_user_id,
    active = true,
    permissions = EXCLUDED.permissions;
