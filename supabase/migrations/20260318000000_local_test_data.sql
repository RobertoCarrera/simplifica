
-- Datos de prueba para el BFF en local
INSERT INTO public.companies (name, slug, is_active, logo_url, settings) 
VALUES (
  'Local Demo', 
  'local-demo', 
  true,
  NULL,
  '{"branding": {"primary_color": "#6366f1", "secondary_color": "#10b981"}}'
) 
ON CONFLICT (slug) DO UPDATE SET 
  settings = EXCLUDED.settings,
  logo_url = EXCLUDED.logo_url;

INSERT INTO public.services (name, base_price, duration_minutes, is_bookable, is_active, company_id) 
SELECT 'Servicio Local 1', 50.00, 30, true, true, id FROM public.companies WHERE slug = 'local-demo' LIMIT 1;
INSERT INTO public.services (name, base_price, duration_minutes, is_bookable, is_active, company_id) 
SELECT 'Servicio Local 2', 75.00, 60, true, true, id FROM public.companies WHERE slug = 'local-demo' LIMIT 1;
