-- Migration: Add Tickets (Ticketing) module to modules and modules_catalog
-- Date: 2025-11-10
-- Idempotent: safe to run multiple times

BEGIN;

-- 1) Ensure modules table has the Tickets entry (used by UI when present)
INSERT INTO modules (key, name, is_active, position)
VALUES (
  'moduloSAT', -- canonical key used in other migrations
  'Tickets',
  true,
  (SELECT COALESCE(MAX(position), 0) + 1 FROM modules)
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active;

-- 2) Also ensure modules_catalog has the Tickets entry (some deployments use this table)
INSERT INTO modules_catalog(key, label)
VALUES ('moduloSAT', 'Tickets')
ON CONFLICT (key) DO NOTHING;

-- 3) Seed user_modules for existing users (idempotent)
INSERT INTO user_modules (user_id, module_key, status)
SELECT u.id, 'moduloSAT',
  CASE
    WHEN u.role IN ('owner', 'admin') THEN 'activado'::module_status
    ELSE 'desactivado'::module_status
  END
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_modules um WHERE um.user_id = u.id AND um.module_key = 'moduloSAT'
);

COMMIT;
