-- Enable RLS on modules_catalog
ALTER TABLE "public"."modules_catalog" ENABLE ROW LEVEL SECURITY;

-- Policy: Allow everyone (authenticated) to view modules
-- This is a catalog, so it's public info for the app.
CREATE POLICY "authenticated_select_modules_catalog" ON "public"."modules_catalog"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (true);

-- Also allow anonymous if needed for login screen? Probably not.
-- But let's stick to authenticated.

-- Seed/Ensure modules exist
INSERT INTO "public"."modules_catalog" (key, label, "position", enabled)
VALUES 
  ('moduloSAT', 'Dispositivos', 1, true),
  ('moduloProductos', 'Productos', 2, true),
  ('moduloServicios', 'Servicios', 3, true),
  ('moduloChat', 'Chat', 4, true),
  ('moduloAnaliticas', 'Analíticas', 5, true),
  ('moduloPresupuestos', 'Presupuestos', 6, true),
  ('moduloFacturas', 'Facturas', 7, true)
ON CONFLICT (key) DO UPDATE
SET 
  label = EXCLUDED.label,
  "position" = EXCLUDED."position",
  enabled = EXCLUDED.enabled;
