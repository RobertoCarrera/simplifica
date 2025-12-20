-- Update default value to match new module keys
ALTER TABLE public.company_settings 
ALTER COLUMN agent_module_access SET DEFAULT '["dashboard", "clients", "moduloSAT", "moduloFacturas", "moduloPresupuestos", "moduloServicios", "moduloProductos", "moduloChat", "moduloAnaliticas"]'::jsonb;

-- Update existing rows that match the old default
UPDATE public.company_settings
SET agent_module_access = '["dashboard", "clients", "moduloSAT", "moduloFacturas", "moduloPresupuestos", "moduloServicios", "moduloProductos", "moduloChat", "moduloAnaliticas"]'::jsonb
WHERE agent_module_access::text = '["dashboard", "tickets", "clients", "invoices", "calendar", "services", "products"]';
