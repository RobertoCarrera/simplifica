-- ============================================================
-- VERIFICAR: Módulo Analytics y Permisos
-- ============================================================

-- 1. Verificar que el módulo de analytics está habilitado
SELECT 'Módulo Analytics' as check_type,
       module_key,
       is_enabled,
       created_at
FROM public.company_modules
WHERE module_key = 'moduloAnaliticas'
  AND company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';

-- 2. Si no existe, crear el módulo
INSERT INTO public.company_modules (company_id, module_key, is_enabled)
VALUES ('cd830f43-f6f0-4b78-a2a4-505e4e0976b5', 'moduloAnaliticas', true)
ON CONFLICT (company_id, module_key) 
DO UPDATE SET is_enabled = true;

-- 3. Verificar de nuevo
SELECT 'Módulo después del insert' as check_type,
       module_key,
       is_enabled
FROM public.company_modules
WHERE module_key = 'moduloAnaliticas'
  AND company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5';
