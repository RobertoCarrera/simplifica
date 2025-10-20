-- =====================================================
-- MIGRATION: Add workflow_category to ticket_stages
-- Fecha: 2025-01-19
-- Descripción: Añade una categoría de flujo de trabajo configurable
--              para clasificar los estados: cancel, waiting, analysis, action, final
--              y establece restricciones por empresa.
-- =====================================================

BEGIN;

-- 1) Crear enum si no existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_category') THEN
    CREATE TYPE workflow_category AS ENUM ('cancel', 'waiting', 'analysis', 'action', 'final');
  END IF;
END $$;

-- 2) Añadir columna a ticket_stages
ALTER TABLE ticket_stages
  ADD COLUMN IF NOT EXISTS workflow_category workflow_category;

-- 3) Backfill best-effort desde nombres
-- Final
UPDATE ticket_stages
SET workflow_category = 'final'
WHERE workflow_category IS NULL AND (
  LOWER(name) LIKE '%entregado%'
  OR LOWER(name) LIKE '%finalizado%'
  OR LOWER(name) LIKE '%completado%'
  OR LOWER(name) LIKE '%cerrado%'
);

-- Cancelación
UPDATE ticket_stages
SET workflow_category = 'cancel'
WHERE workflow_category IS NULL AND (
  LOWER(name) LIKE '%cancelado%'
  OR LOWER(name) LIKE '%anulado%'
);

-- Espera
UPDATE ticket_stages
SET workflow_category = 'waiting'
WHERE workflow_category IS NULL AND (
  LOWER(name) LIKE '%espera%'
  OR LOWER(name) LIKE '%esperando%'
  OR LOWER(name) LIKE '%recibido%'
  OR LOWER(name) LIKE '%pendiente%'
  OR LOWER(name) LIKE '%nuevo%'
);

-- Análisis
UPDATE ticket_stages
SET workflow_category = 'analysis'
WHERE workflow_category IS NULL AND (
  LOWER(name) LIKE '%análisis%'
  OR LOWER(name) LIKE '%analisis%'
);

-- Acción
UPDATE ticket_stages
SET workflow_category = 'action'
WHERE workflow_category IS NULL AND (
  LOWER(name) LIKE '%reparación%'
  OR LOWER(name) LIKE '%reparacion%'
  OR LOWER(name) LIKE '%progreso%'
  OR LOWER(name) LIKE '%proceso%'
  OR LOWER(name) LIKE '%esperando piezas%'
  OR LOWER(name) LIKE '%diagnóstico%'
  OR LOWER(name) LIKE '%diagnostico%'
  OR LOWER(name) LIKE '%listo para entrega%'
);

-- Por defecto, si aún quedan nulos, asignar 'waiting'
UPDATE ticket_stages
SET workflow_category = 'waiting'
WHERE workflow_category IS NULL;

-- 4) Restricciones: por empresa debe existir exactamente uno 'final' y uno 'cancel'
-- Unique parciales por empresa para final y cancel
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_stages_company_final
ON ticket_stages(company_id)
WHERE workflow_category = 'final';

CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_stages_company_cancel
ON ticket_stages(company_id)
WHERE workflow_category = 'cancel';

-- 5) Trigger para impedir quedarse sin al menos un estado por categoría por empresa
CREATE OR REPLACE FUNCTION ensure_min_one_stage_per_category()
RETURNS TRIGGER AS $$
DECLARE
  cats TEXT[] := ARRAY['waiting','analysis','action','final','cancel'];
  cat TEXT;
  cnt INT;
  comp UUID;
BEGIN
  -- Determinar empresa afectada
  comp := COALESCE(NEW.company_id, OLD.company_id);

  FOREACH cat IN ARRAY cats LOOP
    SELECT COUNT(*) INTO cnt
    FROM ticket_stages
    WHERE company_id = comp
      AND workflow_category::text = cat
      AND deleted_at IS NULL;

    IF cnt = 0 THEN
      RAISE EXCEPTION 'Debe existir al menos un estado de la categoría % para la empresa %', cat, comp;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_stages_min_per_category_upd ON ticket_stages;
DROP TRIGGER IF EXISTS trg_ticket_stages_min_per_category_del ON ticket_stages;

-- Solo proteger contra operaciones que eliminen la última de una categoría
-- UPDATE: cuando cambie la categoría, la empresa o se marque como eliminado
CREATE TRIGGER trg_ticket_stages_min_per_category_upd
AFTER UPDATE OF workflow_category, company_id, deleted_at ON ticket_stages
FOR EACH ROW
WHEN (OLD.workflow_category IS DISTINCT FROM NEW.workflow_category OR NEW.deleted_at IS NOT NULL OR OLD.company_id IS DISTINCT FROM NEW.company_id)
EXECUTE FUNCTION ensure_min_one_stage_per_category();

-- DELETE: al borrar un estado
CREATE TRIGGER trg_ticket_stages_min_per_category_del
AFTER DELETE ON ticket_stages
FOR EACH ROW EXECUTE FUNCTION ensure_min_one_stage_per_category();

COMMIT;
