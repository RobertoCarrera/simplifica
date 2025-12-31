-- Seed modules_catalog with standard production modules
-- keys match ResponsiveSidebarComponent.ts expectations

INSERT INTO public.modules_catalog (key, label)
VALUES 
    ('moduloSAT', 'Tickets y Soporte (SAT)'),
    ('moduloPresupuestos', 'Gestión de Presupuestos'),
    ('moduloFacturas', 'Facturación y Cobros'),
    ('moduloServicios', 'Gestión de Servicios'),
    ('moduloAnaliticas', 'Analíticas e Informes'),
    ('moduloProductos', 'Productos y Materiales'),
    ('moduloChat', 'Chat Interno')
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label;
