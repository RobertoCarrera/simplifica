-- Insert the user linking to the EXISTING company and EXISTING auth user
INSERT INTO "public"."users" ("id", "company_id", "email", "name", "role", "active", "auth_user_id", "permissions")
VALUES (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', -- Valid UUID
    'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', -- The company ID we acted created
    'test@example.com', 
    'Usuario Demo', 
    'owner', 
    true, 
    '6adfa925-7050-4fae-914a-4957c1f69a20', -- The REAL auth ID the user reported
    '{"moduloFacturas": true, "moduloMaterial": true, "moduloServicios": true, "moduloPresupuestos": true}'::jsonb
) ON CONFLICT (email) DO UPDATE SET 
    auth_user_id = EXCLUDED.auth_user_id,
    active = true,
    permissions = EXCLUDED.permissions;

-- Refresh views
REFRESH MATERIALIZED VIEW analytics.mv_invoice_kpis_monthly;
REFRESH MATERIALIZED VIEW analytics.mv_ticket_kpis_monthly;
