
-- Modules Configuration
INSERT INTO "public"."modules" ("key", "name", "description", "enabled_by_default", "is_active") VALUES
('moduloSAT', 'Tickets y Soporte', 'Gestión de tickets y dispositivos', true, true),
('moduloChat', 'Chat Interno', 'Sistema de mensajería', true, true),
('moduloPresupuestos', 'Presupuestos', 'Gestión de presupuestos', true, true),
('moduloFacturas', 'Facturación', 'Gestión de facturas', true, true),
('moduloAnaliticas', 'Analíticas', 'Reportes y estadísticas', true, true),
('moduloProductos', 'Productos', 'Catálogo de productos', true, true),
('moduloServicios', 'Servicios', 'Catálogo de servicios', true, true)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "public"."modules_catalog" ("key", "label") VALUES
('moduloSAT', 'Tickets y Soporte'),
('moduloChat', 'Chat Interno'),
('moduloPresupuestos', 'Presupuestos'),
('moduloFacturas', 'Facturación'),
('moduloAnaliticas', 'Analíticas'),
('moduloProductos', 'Productos'),
('moduloServicios', 'Servicios')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "public"."user_modules" ("user_id", "module_key", "status") VALUES
('84efaa41-9734-4410-b0f2-9101e225ce0c', 'moduloSAT', 'activado'),
('84efaa41-9734-4410-b0f2-9101e225ce0c', 'moduloChat', 'activado'),
('84efaa41-9734-4410-b0f2-9101e225ce0c', 'moduloPresupuestos', 'activado'),
('84efaa41-9734-4410-b0f2-9101e225ce0c', 'moduloFacturas', 'activado'),
('84efaa41-9734-4410-b0f2-9101e225ce0c', 'moduloAnaliticas', 'activado'),
('84efaa41-9734-4410-b0f2-9101e225ce0c', 'moduloProductos', 'activado'),
('84efaa41-9734-4410-b0f2-9101e225ce0c', 'moduloServicios', 'activado')
ON CONFLICT ("user_id", "module_key") DO UPDATE SET "status" = 'activado';

INSERT INTO "public"."tag_scopes" ("id", "label", "color", "module_key") VALUES
('clients', 'Clientes', '#3B82F6', 'core'),
('tickets', 'Tickets', '#EF4444', 'moduloSAT'),
('services', 'Servicios', '#10B981', 'moduloServicios')
ON CONFLICT ("id") DO UPDATE SET 
    "label" = EXCLUDED."label",
    "color" = EXCLUDED."color",
    "module_key" = EXCLUDED."module_key";
