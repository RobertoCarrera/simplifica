-- Create service_units table for Units of Measure
-- Company-scoped catalog with soft-delete and basic uniqueness

BEGIN;

CREATE TABLE IF NOT EXISTS service_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Unique constraints per company (company_id can be null for global units)
CREATE UNIQUE INDEX IF NOT EXISTS service_units_company_code_uniq
  ON service_units (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(code))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_units_company_name_uniq
  ON service_units (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  WHERE deleted_at IS NULL;

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_service_units_updated_at ON service_units;
CREATE TRIGGER trg_service_units_updated_at
BEFORE UPDATE ON service_units
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seeds: global defaults (null company_id) if table empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM service_units) THEN
    INSERT INTO service_units (company_id, name, code, description)
    VALUES
      (NULL, 'Horas', 'horas', 'Unidad de tiempo en horas'),
      (NULL, 'Unidades', 'unidades', 'Conteo de piezas/elementos'),
      (NULL, 'Días', 'dias', 'Días de trabajo'),
      (NULL, 'Trabajos', 'trabajos', 'Trabajos cerrados/entregas'),
      (NULL, 'Licencias', 'licencias', 'Licencias o suscripciones'),
      (NULL, 'Sesiones', 'sesiones', 'Sesiones o citas');
  END IF;
END $$;

-- RLS scaffolding (adjust to your policy helpers):
-- ALTER TABLE service_units ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY service_units_select ON service_units
--   FOR SELECT USING (
--     -- allow global (company_id is null) or same company
--     company_id IS NULL OR company_id = auth.uid()::uuid OR company_id = current_setting('request.jwt.claims.company_id', true)::uuid
--   );
-- CREATE POLICY service_units_modify ON service_units
--   FOR ALL USING (
--     company_id = current_setting('request.jwt.claims.company_id', true)::uuid
--   ) WITH CHECK (
--     company_id = current_setting('request.jwt.claims.company_id', true)::uuid
--   );

COMMIT;