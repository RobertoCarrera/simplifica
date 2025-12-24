-- Insert Company
INSERT INTO "public"."companies" ("id", "name", "slug", "nif", "is_active", "subscription_tier")
VALUES ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Empresa Demo', 'empresa-demo', 'B12345678', true, 'pro')
ON CONFLICT DO NOTHING;

-- Global tags seed
INSERT INTO "public"."global_tags" ("name", "color", "category", "scope")
VALUES 
('Vip', '#FFD700', 'Status', ARRAY['clients']),
('Urgente', '#EF4444', 'Priority', ARRAY['tickets']),
('Nuevo', '#3B82F6', 'Status', NULL)
ON CONFLICT DO NOTHING;

