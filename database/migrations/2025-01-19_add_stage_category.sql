-- =====================================================
-- MIGRATION: Add stage_category to ticket_stages
-- Fecha: 2025-01-19
-- Descripción: Añade una categoría a los stages de tickets
--              para poder clasificarlos de forma confiable:
--              - 'open': Estados abiertos/pendientes
--              - 'in_progress': Estados en progreso
--              - 'completed': Estados completados/cerrados
--              - 'on_hold': Estados en espera
-- =====================================================

BEGIN;

-- 1) Crear el enum para las categorías de stages
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stage_category') THEN
    CREATE TYPE stage_category AS ENUM ('open', 'in_progress', 'completed', 'on_hold');
  END IF;
END $$;

-- 2) Añadir la columna stage_category a ticket_stages
ALTER TABLE ticket_stages
ADD COLUMN IF NOT EXISTS stage_category stage_category DEFAULT 'open';

-- 3) Actualizar los stages existentes según su nombre
-- (Esto es un best-effort; ajusta según tus datos reales)

-- Stages abiertos/pendientes
UPDATE ticket_stages
SET stage_category = 'open'
WHERE stage_category = 'open' -- ya tiene el default
  AND (
    LOWER(name) LIKE '%recibido%'
    OR LOWER(name) LIKE '%abierto%'
    OR LOWER(name) LIKE '%pendiente%'
    OR LOWER(name) LIKE '%nuevo%'
  );

-- Stages en progreso
UPDATE ticket_stages
SET stage_category = 'in_progress'
WHERE (
  LOWER(name) LIKE '%progreso%'
  OR LOWER(name) LIKE '%proceso%'
  OR LOWER(name) LIKE '%diagnóstico%'
  OR LOWER(name) LIKE '%diagnostico%'
  OR LOWER(name) LIKE '%reparación%'
  OR LOWER(name) LIKE '%reparacion%'
  OR LOWER(name) LIKE '%análisis%'
  OR LOWER(name) LIKE '%analisis%'
);

-- Stages completados
UPDATE ticket_stages
SET stage_category = 'completed'
WHERE (
  LOWER(name) LIKE '%completado%'
  OR LOWER(name) LIKE '%finalizado%'
  OR LOWER(name) LIKE '%cerrado%'
  OR LOWER(name) LIKE '%entregado%'
  OR LOWER(name) LIKE '%resuelto%'
  OR LOWER(name) LIKE '%listo%'
);

-- Stages en espera
UPDATE ticket_stages
SET stage_category = 'on_hold'
WHERE (
  LOWER(name) LIKE '%espera%'
  OR LOWER(name) LIKE '%esperando%'
  OR LOWER(name) LIKE '%pausado%'
  OR LOWER(name) LIKE '%hold%'
);

-- 4) Crear índice para mejorar las consultas por categoría
CREATE INDEX IF NOT EXISTS idx_ticket_stages_category 
ON ticket_stages(stage_category);

-- 5) Comentarios para documentación
COMMENT ON COLUMN ticket_stages.stage_category IS 'Categoría del stage: open, in_progress, completed, on_hold';

COMMIT;
