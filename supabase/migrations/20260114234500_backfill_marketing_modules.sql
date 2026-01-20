-- Backfill company_modules for Marketing
-- Ensures every company has the marketing module entry.

INSERT INTO public.company_modules (company_id, module_key, status)
SELECT id, 'moduloMarketing', 'active'
FROM public.companies
ON CONFLICT (company_id, module_key) DO NOTHING;
