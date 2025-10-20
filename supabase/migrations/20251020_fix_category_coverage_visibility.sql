-- =============================================================
-- Fix: Ensure category coverage counts VISIBLE stages per company
-- Date: 2025-10-20
-- Context:
--   The original ensure_min_one_stage_per_category() only counted
--   company-owned stages. This incorrectly raised errors when a
--   company had zero company stages for a category but DID have a
--   visible generic (system) stage (company_id IS NULL and not
--   hidden in hidden_stages).
--
--   This patch replaces the function to count "visible" stages:
--     visible = (company_id = comp) OR (company_id IS NULL AND NOT hidden)
--   for each workflow_category. Triggers remain the same and will
--   call this updated function.
-- =============================================================

BEGIN;

CREATE OR REPLACE FUNCTION ensure_min_one_stage_per_category()
RETURNS TRIGGER AS $$
DECLARE
  cats TEXT[] := ARRAY['waiting','analysis','action','final','cancel'];
  cat TEXT;
  cnt INT;
  comp UUID;
BEGIN
  -- Determine affected company (works for UPDATE/DELETE)
  comp := COALESCE(NEW.company_id, OLD.company_id);

  -- If company cannot be determined, allow (no-op)
  IF comp IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOREACH cat IN ARRAY cats LOOP
    -- Count VISIBLE stages for this company and category
    -- visible = company-owned OR (generic and NOT hidden by this company)
    SELECT COUNT(*) INTO cnt
    FROM ticket_stages s
    WHERE s.deleted_at IS NULL
      AND s.workflow_category::text = cat
      AND (
        s.company_id = comp
        OR (
          s.company_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM hidden_stages h
             WHERE h.company_id = comp AND h.stage_id = s.id
          )
        )
      );

    IF cnt = 0 THEN
      RAISE EXCEPTION 'Debe existir al menos un estado visible de la categoría % para la empresa %', cat, comp;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Triggers already exist and will now use the updated function.
-- Kept as reference; do not recreate to avoid side effects:
--   trg_ticket_stages_min_per_category_upd (AFTER UPDATE OF workflow_category, company_id, deleted_at)
--   trg_ticket_stages_min_per_category_del (AFTER DELETE)

COMMIT;
