-- Modules catalog for server-side feature flags
-- Run this SQL in your Supabase database

CREATE TABLE IF NOT EXISTS public.modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  enabled_by_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  plan_required TEXT,
  price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists (idempotent)
DROP POLICY IF EXISTS modules_select_active ON public.modules;

-- Create policy: authenticated users see active modules; service role sees all
CREATE POLICY modules_select_active
  ON public.modules FOR SELECT
  USING (is_active = true OR auth.role() = 'service_role');

-- Seed basic modules (idempotent with ON CONFLICT)
INSERT INTO public.modules (key, name, description, category, position, enabled_by_default, is_active) VALUES
  ('moduloPresupuestos', 'Presupuestos', 'Gestión de presupuestos', 'ventas', 10, true, true),
  ('moduloServicios', 'Servicios', 'Catálogo de servicios', 'ventas', 20, true, true),
  ('moduloMaterial', 'Material/Productos', 'Gestión de productos y material', 'inventario', 30, true, true),
  ('moduloFacturas', 'Facturación', 'Emitir y gestionar facturas', 'facturacion', 40, false, true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  position = EXCLUDED.position,
  enabled_by_default = EXCLUDED.enabled_by_default,
  is_active = EXCLUDED.is_active,
  updated_at = now();
