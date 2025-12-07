-- Migration: Add Chat and Verifactu modules
-- Date: 2024-12-07
-- Description: Adds moduloChat and moduloVerifactu to enable granular control
--              over Chat access and Verifactu (AEAT) integration separately from billing.

-- 1) Add moduloChat to public.modules table
INSERT INTO public.modules (key, name, description, category, position, enabled_by_default, is_active) VALUES
  ('moduloChat', 'Chat', 'Chat integrado con clientes y equipo', 'comunicacion', 60, false, true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  position = EXCLUDED.position,
  enabled_by_default = EXCLUDED.enabled_by_default,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- 2) Add moduloVerifactu to public.modules table
INSERT INTO public.modules (key, name, description, category, position, enabled_by_default, is_active) VALUES
  ('moduloVerifactu', 'Verifactu (AEAT)', 'Envío de facturas a la AEAT vía Verifactu', 'facturacion', 45, false, true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  position = EXCLUDED.position,
  enabled_by_default = EXCLUDED.enabled_by_default,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- 3) Seed default 'desactivado' status for existing users who don't have these modules
INSERT INTO user_modules (user_id, module_key, status)
SELECT u.id, 'moduloChat', 'desactivado'::module_status
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_modules um 
  WHERE um.user_id = u.id AND um.module_key = 'moduloChat'
)
ON CONFLICT (user_id, module_key) DO NOTHING;

INSERT INTO user_modules (user_id, module_key, status)
SELECT u.id, 'moduloVerifactu', 'desactivado'::module_status
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_modules um 
  WHERE um.user_id = u.id AND um.module_key = 'moduloVerifactu'
)
ON CONFLICT (user_id, module_key) DO NOTHING;

-- Note: Users who had Verifactu configured before should have moduloVerifactu enabled.
-- Run this optional update to auto-enable for companies with verifactu_settings:
/*
UPDATE user_modules um
SET status = 'activado'
WHERE um.module_key = 'moduloVerifactu'
  AND EXISTS (
    SELECT 1 FROM verifactu_settings vs
    JOIN users u ON u.company_id = vs.company_id
    WHERE u.id = um.user_id
  );
*/
