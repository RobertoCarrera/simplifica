-- Insert standard modules to satisfy foreign key constraints in user_modules
INSERT INTO public.modules (key, name, description, category, position, is_active, price) VALUES
('moduloFacturas', 'Facturas', 'Gestión de facturación', 'finance', 1, true, 0),
('moduloPresupuestos', 'Presupuestos', 'Gestión de presupuestos', 'finance', 2, true, 0),
('moduloServicios', 'Servicios', 'Catálogo de servicios', 'sales', 3, true, 0),
('moduloMaterial', 'Material', 'Gestión de material', 'inventory', 4, true, 0),
('moduloClientes', 'Clientes', 'CRM de clientes', 'crm', 5, true, 0),
('moduloTickets', 'Tickets', 'Sistema de tickets', 'support', 6, true, 0)
ON CONFLICT (key) DO UPDATE SET 
    name = EXCLUDED.name,
    is_active = true;
