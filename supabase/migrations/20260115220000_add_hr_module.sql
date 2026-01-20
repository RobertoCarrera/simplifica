-- Add HR Module to the catalog
-- Schema of modules_catalog is (key text, label text, created_at)
INSERT INTO public.modules_catalog (key, label)
VALUES (
    'moduloRRHH',
    'Recursos Humanos'
) ON CONFLICT (key) DO UPDATE 
SET label = EXCLUDED.label;

-- Optionally, we could enable it for all current companies to streamline onboarding
-- INSERT INTO public.company_modules (company_id, module_key, status)
-- SELECT id, 'moduloRRHH', 'active' FROM public.companies
-- ON CONFLICT (company_id, module_key) DO NOTHING;
