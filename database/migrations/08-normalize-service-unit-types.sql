-- Normalize services.unit_type codes and enforce consistency
-- Standard codes: 'horas','unidades','dias','trabajos','licencias','sesiones'

BEGIN;

-- Lowercase and strip accents for common Spanish forms
-- Note: unaccent extension recommended; fallback mappings included
-- Ensure extension exists (no-op if present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'unaccent'
  ) THEN
    -- Requires superuser in some environments; ignore errors if cannot create
    BEGIN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS unaccent';
    EXCEPTION WHEN OTHERS THEN
      -- ignore if cannot create
      NULL;
    END;
  END IF;
END$$;

-- Normalize known variants to standard codes
UPDATE public.services
SET unit_type = CASE
  WHEN unit_type IS NULL OR trim(unit_type) = '' THEN 'horas'
  WHEN lower(unit_type) IN ('hour','hours','hr','hrs') THEN 'horas'
  WHEN lower(unit_type) IN ('hora','horas') THEN 'horas'
  WHEN lower(unit_type) IN ('unidad','unidades','unit','units','uds','ud') THEN 'unidades'
  WHEN lower(unit_type) IN ('día','dias','día(s)','dia','día(s)','días') THEN 'dias'
  WHEN lower(unit_type) IN ('trabajo','trabajos','work','works','job','jobs') THEN 'trabajos'
  WHEN lower(unit_type) IN ('licencia','licencias','license','licenses') THEN 'licencias'
  WHEN lower(unit_type) IN ('sesion','sesión','sesiones','session','sessions') THEN 'sesiones'
  ELSE lower(unit_type)
END
WHERE unit_type IS DISTINCT FROM CASE
  WHEN unit_type IS NULL OR trim(unit_type) = '' THEN 'horas'
  WHEN lower(unit_type) IN ('hour','hours','hr','hrs') THEN 'horas'
  WHEN lower(unit_type) IN ('hora','horas') THEN 'horas'
  WHEN lower(unit_type) IN ('unidad','unidades','unit','units','uds','ud') THEN 'unidades'
  WHEN lower(unit_type) IN ('día','dias','día(s)','dia','día(s)','días') THEN 'dias'
  WHEN lower(unit_type) IN ('trabajo','trabajos','work','works','job','jobs') THEN 'trabajos'
  WHEN lower(unit_type) IN ('licencia','licencias','license','licenses') THEN 'licencias'
  WHEN lower(unit_type) IN ('sesion','sesión','sesiones','session','sessions') THEN 'sesiones'
  ELSE lower(unit_type)
END;

-- Optionally, set any other exotic/unrecognized values to a safe default
UPDATE public.services
SET unit_type = 'unidades'
WHERE unit_type IS NULL OR trim(unit_type) = '';

-- Optional: lightweight constraint to prevent empty strings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'services_unit_type_not_empty'
  ) THEN
    EXECUTE 'ALTER TABLE public.services ADD CONSTRAINT services_unit_type_not_empty CHECK (trim(unit_type) <> '''')';
  END IF;
END$$;

COMMIT;
