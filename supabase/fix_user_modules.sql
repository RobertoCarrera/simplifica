-- Populate user_modules for the local user
INSERT INTO public.user_modules (user_id, module_key, status) VALUES
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'moduloFacturas', 'activado'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'moduloPresupuestos', 'activado'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'moduloServicios', 'activado'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'moduloMaterial', 'activado'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'moduloClientes', 'activado'),
('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'moduloTickets', 'activado')
ON CONFLICT (user_id, module_key) DO UPDATE SET status = 'activado';
