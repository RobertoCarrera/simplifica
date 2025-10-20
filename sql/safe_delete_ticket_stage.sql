-- ================================================================
-- SAFE DELETE FOR TICKET STAGES
-- ================================================================
-- Function: safe_delete_ticket_stage
-- Purpose:
--   - Prevent 409 FK conflicts when deleting from ticket_stages by
--     optionally reassigning existing tickets to another stage first.
--   - Enforces that both the source stage and the optional reassignment
--     stage belong to the same company.
--   - Cleans up related rows (e.g., hidden_stages) if the table exists.
--
-- Usage:
--   SELECT safe_delete_ticket_stage(
--     p_stage_id    => 'UUID-OF-STAGE-TO-DELETE',
--     p_company_id  => 'UUID-OF-COMPANY',
--     p_reassign_to => 'UUID-OF-FALLBACK-STAGE'  -- optional
--   );
--
-- Returns JSON with details, for example:
-- {
--   "deleted": true,
--   "reassignedTickets": 12,
--   "stageId": "...",
--   "reassignedTo": "...",
--   "companyId": "..."
-- }
-- ================================================================

CREATE OR REPLACE FUNCTION safe_delete_ticket_stage(
  p_stage_id uuid,
  p_company_id uuid,
  p_reassign_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_stage_company uuid;
  v_reassign_company uuid;
  v_exists integer;
  v_reassigned integer := 0;
  v_workflow text;
  v_stagecat text;
  v_visible_same_cat integer := 0;
  v_candidate_system_stage uuid;
  v_cat text;
  v_required_cats text[] := ARRAY['waiting','analysis','action','final','cancel'];
BEGIN
  IF p_stage_id IS NULL THEN
    RAISE EXCEPTION 'p_stage_id is required';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'p_company_id is required';
  END IF;

  -- Validate the stage exists and belongs to the company
  SELECT company_id INTO v_stage_company
  FROM ticket_stages
  WHERE id = p_stage_id
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_stage_company IS NULL THEN
    RAISE EXCEPTION 'Stage % not found or already deleted', p_stage_id;
  END IF;

  IF v_stage_company <> p_company_id THEN
    RAISE EXCEPTION 'Stage % does not belong to company %', p_stage_id, p_company_id;
  END IF;

  -- Get categories of the stage being deleted
  SELECT workflow_category, stage_category
    INTO v_workflow, v_stagecat
  FROM ticket_stages
  WHERE id = p_stage_id
    AND deleted_at IS NULL;

  -- Count how many visible stages of the same workflow category remain (excluding the one to delete)
  -- "Visible for company" means: owned by company OR (system AND not hidden by company)
  SELECT COUNT(*) INTO v_visible_same_cat
  FROM ticket_stages s
  WHERE s.deleted_at IS NULL
    AND s.id <> p_stage_id
    AND (
      -- Visible for company
      s.company_id = p_company_id
      OR (
        s.company_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM hidden_stages h
           WHERE h.company_id = p_company_id AND h.stage_id = s.id
        )
      )
    )
    AND (
      (v_workflow IS NOT NULL AND s.workflow_category = v_workflow)
      OR (v_workflow IS NULL AND s.stage_category = v_stagecat)
    );

  -- If none remain, try to auto-unhide a matching system stage to preserve coverage
  IF v_visible_same_cat = 0 THEN
    SELECT s.id INTO v_candidate_system_stage
    FROM ticket_stages s
    WHERE s.deleted_at IS NULL
      AND s.company_id IS NULL
      AND (
        (v_workflow IS NOT NULL AND s.workflow_category = v_workflow)
        OR (v_workflow IS NULL AND s.stage_category = v_stagecat)
      )
      AND EXISTS (
        SELECT 1 FROM hidden_stages h
         WHERE h.company_id = p_company_id AND h.stage_id = s.id
      )
    LIMIT 1;

    IF v_candidate_system_stage IS NOT NULL THEN
      -- Unhide it for this company
      DELETE FROM hidden_stages
       WHERE company_id = p_company_id AND stage_id = v_candidate_system_stage;

      -- Recount
      SELECT COUNT(*) INTO v_visible_same_cat
      FROM ticket_stages s
      WHERE s.deleted_at IS NULL
        AND s.id <> p_stage_id
        AND (
          s.company_id = p_company_id
          OR (
            s.company_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM hidden_stages h
               WHERE h.company_id = p_company_id AND h.stage_id = s.id
            )
          )
        )
        AND (
          (v_workflow IS NOT NULL AND s.workflow_category = v_workflow)
          OR (v_workflow IS NULL AND s.stage_category = v_stagecat)
        );
    END IF;
  END IF;

  IF v_visible_same_cat = 0 THEN
    RAISE EXCEPTION 'Debe existir al menos un estado visible de la categoría % para la empresa % (activa algún estado del sistema o crea uno nuevo)',
      COALESCE(v_workflow, v_stagecat), p_company_id;
  END IF;

  -- Ensure global coverage across required workflow categories
  FOREACH v_cat IN ARRAY v_required_cats LOOP
    -- count visible for v_cat
    SELECT COUNT(*) INTO v_visible_same_cat
    FROM ticket_stages s
    WHERE s.deleted_at IS NULL
      AND s.id <> p_stage_id
      AND (
        s.company_id = p_company_id
        OR (
          s.company_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM hidden_stages h
             WHERE h.company_id = p_company_id AND h.stage_id = s.id
          )
        )
      )
      AND s.workflow_category = v_cat;

    IF v_visible_same_cat = 0 THEN
      -- try to unhide a system stage for v_cat
      SELECT s.id INTO v_candidate_system_stage
      FROM ticket_stages s
      WHERE s.deleted_at IS NULL
        AND s.company_id IS NULL
        AND s.workflow_category = v_cat
        AND EXISTS (
          SELECT 1 FROM hidden_stages h
           WHERE h.company_id = p_company_id AND h.stage_id = s.id
        )
      LIMIT 1;

      IF v_candidate_system_stage IS NOT NULL THEN
        DELETE FROM hidden_stages
         WHERE company_id = p_company_id AND stage_id = v_candidate_system_stage;

        -- recount
        SELECT COUNT(*) INTO v_visible_same_cat
        FROM ticket_stages s
        WHERE s.deleted_at IS NULL
          AND s.id <> p_stage_id
          AND (
            s.company_id = p_company_id
            OR (
              s.company_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM hidden_stages h
                 WHERE h.company_id = p_company_id AND h.stage_id = s.id
              )
            )
          )
          AND s.workflow_category = v_cat;
      END IF;
    END IF;

    IF v_visible_same_cat = 0 THEN
      RAISE EXCEPTION 'Debe existir al menos un estado de la categoría % visible para la empresa %', v_cat, p_company_id;
    END IF;
  END LOOP;

  -- If provided, validate reassign stage
  IF p_reassign_to IS NOT NULL THEN
    IF p_reassign_to = p_stage_id THEN
      RAISE EXCEPTION 'p_reassign_to cannot be the same as p_stage_id';
    END IF;

    SELECT company_id INTO v_reassign_company
    FROM ticket_stages
    WHERE id = p_reassign_to
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_reassign_company IS NULL THEN
      RAISE EXCEPTION 'Reassign stage % not found or deleted', p_reassign_to;
    END IF;

    IF v_reassign_company <> p_company_id THEN
      RAISE EXCEPTION 'Reassign stage % belongs to a different company', p_reassign_to;
    END IF;
  END IF;

  -- Check if there are tickets referencing the stage
  SELECT COUNT(*) INTO v_exists
  FROM tickets
  WHERE stage_id = p_stage_id
    AND company_id = p_company_id
    AND deleted_at IS NULL;

  -- If there are tickets, either reassign or block
  IF v_exists > 0 THEN
    IF p_reassign_to IS NULL THEN
      RAISE EXCEPTION 'Stage % is referenced by % tickets. Provide p_reassign_to to reassign before delete.', p_stage_id, v_exists;
    END IF;

    UPDATE tickets
    SET stage_id = p_reassign_to,
        updated_at = NOW()
    WHERE stage_id = p_stage_id
      AND company_id = p_company_id
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_reassigned = ROW_COUNT;
  END IF;

  -- Clean references in hidden_stages if such table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hidden_stages'
  ) THEN
    DELETE FROM hidden_stages
    WHERE stage_id = p_stage_id
      AND company_id = p_company_id;
  END IF;

  -- Finally, delete the stage
  DELETE FROM ticket_stages
  WHERE id = p_stage_id
    AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to delete stage % (not found or already deleted)', p_stage_id;
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'reassignedTickets', v_reassigned,
    'stageId', p_stage_id,
    'reassignedTo', p_reassign_to,
    'companyId', p_company_id,
    'deletedAt', NOW()
  );
END;
$$;

-- Optional: grants (adjust roles as needed)
-- GRANT EXECUTE ON FUNCTION safe_delete_ticket_stage(uuid, uuid, uuid) TO authenticated;
