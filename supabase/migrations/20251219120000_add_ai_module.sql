-- Migration: Add AI module
-- Date: 2025-12-19
-- Description: Adds 'ai' module to control access to Voice and Vision features.

-- 1) Add 'ai' to public.modules table
INSERT INTO public.modules (key, name, description, category, position, enabled_by_default, is_active) VALUES
  ('ai', 'Inteligencia Artificial', 'Acceso a funciones de voz (Tickets, Presupuestos) y visión (Escaneo de equipos).', 'productividad', 70, false, true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  position = EXCLUDED.position,
  enabled_by_default = EXCLUDED.enabled_by_default,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- 2) Seed default 'desactivado' status for existing users who don't have this module
INSERT INTO user_modules (user_id, module_key, status)
SELECT u.id, 'ai', 'desactivado'::module_status
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_modules um 
  WHERE um.user_id = u.id AND um.module_key = 'ai'
)
ON CONFLICT (user_id, module_key) DO NOTHING;
