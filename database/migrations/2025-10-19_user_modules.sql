-- Migration: user_modules with status enum and policies
-- Creates an enum for module status and a relational table to attach per-user module states.

-- 1) Enum for status
DO $$ BEGIN
  CREATE TYPE module_status AS ENUM ('activado', 'desactivado', 'en_desarrollo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Modules catalog (optional future extension)
CREATE TABLE IF NOT EXISTS modules_catalog (
  key text PRIMARY KEY,
  label text NOT NULL
);

INSERT INTO modules_catalog(key, label) VALUES
  ('moduloFacturas', 'Facturación'),
  ('moduloPresupuestos', 'Presupuestos'),
  ('moduloServicios', 'Servicios'),
  ('moduloMaterial', 'Material')
ON CONFLICT (key) DO NOTHING;

-- 3) User modules table
CREATE TABLE IF NOT EXISTS user_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES modules_catalog(key) ON DELETE RESTRICT,
  status module_status NOT NULL DEFAULT 'desactivado',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_key)
);

-- 4) Trigger to update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_modules_updated_at ON user_modules;
CREATE TRIGGER trg_user_modules_updated_at
BEFORE UPDATE ON user_modules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 5) Seed default rows for existing users (desactivado by default)
INSERT INTO user_modules (user_id, module_key, status)
SELECT u.id, mc.key, 'desactivado'::module_status
FROM public.users u
CROSS JOIN modules_catalog mc
ON CONFLICT (user_id, module_key) DO NOTHING;

-- 6) RLS
ALTER TABLE user_modules ENABLE ROW LEVEL SECURITY;

-- Policy: users can see their own module states
DROP POLICY IF EXISTS user_modules_select_own ON user_modules;
CREATE POLICY user_modules_select_own ON user_modules
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users pu
    WHERE pu.id = user_modules.user_id
      AND pu.auth_user_id = auth.uid()
  )
);

-- Policy: users can update their own module states (optional; restrict to admin/owner if needed)
DROP POLICY IF EXISTS user_modules_update_own ON user_modules;
CREATE POLICY user_modules_update_own ON user_modules
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users pu
    WHERE pu.id = user_modules.user_id
      AND pu.auth_user_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users pu
    WHERE pu.id = user_modules.user_id
      AND pu.auth_user_id = auth.uid()
  )
);

-- Policy: insert only by admins via RPC (by default deny); you can later add RPC for bulk config
DROP POLICY IF EXISTS user_modules_insert_none ON user_modules;
CREATE POLICY user_modules_insert_none ON user_modules FOR INSERT TO authenticated WITH CHECK (false);

-- 7) Helper view for the current user
CREATE OR REPLACE VIEW v_current_user_modules AS
SELECT um.*
FROM user_modules um
JOIN public.users u ON u.id = um.user_id
WHERE u.auth_user_id = auth.uid();

-- 8) Upsert function (admin/owner guard recommended)
CREATE OR REPLACE FUNCTION upsert_user_module(p_user_id uuid, p_module_key text, p_status module_status)
RETURNS void AS $$
DECLARE
  v_role text;
BEGIN
  -- Optional: check role of current user
  SELECT role INTO v_role FROM public.users WHERE auth_user_id = auth.uid();
  IF v_role NOT IN ('admin','owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  INSERT INTO user_modules(user_id, module_key, status)
  VALUES (p_user_id, p_module_key, p_status)
  ON CONFLICT(user_id, module_key)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
