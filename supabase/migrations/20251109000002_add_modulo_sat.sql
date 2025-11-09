-- Migration: Add moduloSAT to modules_catalog
-- Date: 2025-11-09

INSERT INTO modules_catalog(key, label) VALUES
  ('moduloSAT', 'Tickets')
ON CONFLICT (key) DO NOTHING;

-- Seed default rows for existing users (activado by default for owner/admin)
INSERT INTO user_modules (user_id, module_key, status)
SELECT u.id, 'moduloSAT', 
  CASE 
    WHEN u.role IN ('owner', 'admin') THEN 'activado'::module_status
    ELSE 'desactivado'::module_status
  END
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_modules um 
  WHERE um.user_id = u.id AND um.module_key = 'moduloSAT'
);
