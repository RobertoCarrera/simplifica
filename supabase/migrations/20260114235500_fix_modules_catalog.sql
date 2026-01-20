-- Insert into modules_catalog (The REAL table used by RPCs)
INSERT INTO public.modules_catalog (key, label)
VALUES ('moduloMarketing', 'Marketing y Lealtad')
ON CONFLICT (key) DO NOTHING;

-- Also ensure company_modules has it (just in case)
INSERT INTO public.company_modules (company_id, module_key, status)
SELECT id, 'moduloMarketing', 'active'
FROM public.companies
ON CONFLICT (company_id, module_key) DO NOTHING;
