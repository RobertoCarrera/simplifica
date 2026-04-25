-- Add 'moduloReservas' to the module catalog
INSERT INTO public.modules_catalog (key, label, description, price, currency, is_active, category)
VALUES (
    'moduloReservas',
    'Reservas y Agenda',
    'Gestión de reservas, calendarios y disponibilidad de recursos.',
    15.00,
    'EUR',
    true,
    'productivity'
)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- Initially enable it for all companies that have 'moduloServicios' enabled (optional, but requested implicitly)
-- Or leave it to be enabled manually. Let's leave it manual or auto-enable for owner for testing.
-- For now, just insert the catalog item. Owners can enable it in Admin > Modules.

-- If we want access right away for development, we can insert into 'company_modules' for the current testing company?
-- It's safer to just provide the catalog item and ask user to enable it, or use the UI.
