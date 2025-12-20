-- Rewriting the automation function with refined logic based on user feedback
-- 1. Client comments should NOT trigger stage changes (prevent "En Diagnóstico" jumps).
-- 2. First Staff comment on a ticket should move it to "En Análisis" (if current stage is lower).

CREATE OR REPLACE FUNCTION handle_ticket_comment_automation()
RETURNS TRIGGER AS $$
DECLARE
  v_stage_id uuid;
  v_stage_pos int;
  v_target_stage_id uuid;
  v_user_comment_count int;
  v_current_stage_name text;
BEGIN
  -- 1. Client Logic: DO NOT update stage automatically
  -- Only manual updates via "Mark as Solved" or re-open (if decided later)
  IF NEW.client_id IS NOT NULL THEN
     RETURN NEW; 
  END IF;

  -- 2. Staff Logic: First comment moves to 'En Análisis'
  IF NEW.user_id IS NOT NULL THEN
    -- Check if this is the FIRST comment by a staff member on this ticket
    SELECT count(*) INTO v_user_comment_count 
    FROM ticket_comments 
    WHERE ticket_id = NEW.ticket_id AND user_id IS NOT NULL;
    
    -- Since this is AFTER INSERT, count includes new row, so it should be at least 1
    -- We only want to trigger on the very first one.
    IF v_user_comment_count = 1 THEN
       -- Get current stage info
       SELECT id, position, name INTO v_stage_id, v_stage_pos, v_current_stage_name
       FROM ticket_stages
       WHERE id = (SELECT stage_id FROM tickets WHERE id = NEW.ticket_id);
       
       -- Find 'En Análisis' stage (Position-based or Name-based)
       -- We prioritize finding a stage named exactly 'En Análisis' or in 'analysis' workflow
       SELECT id INTO v_target_stage_id
       FROM ticket_stages
       WHERE 
         (company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id) OR company_id IS NULL)
         AND deleted_at IS NULL
         AND (
           name ILIKE '%Análisis%' 
           OR workflow_category = 'analysis'
         )
         -- Avoid hidden stages
         AND NOT EXISTS (
            SELECT 1 FROM hidden_stages hs 
            WHERE hs.stage_id = ticket_stages.id 
            AND hs.company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id)
         )
       ORDER BY 
         -- Prefer company specific
         (company_id IS NOT NULL) DESC,
         -- Prefer name match
         (name ILIKE '%Análisis%') DESC,
         -- Lower position usually means earlier in this phase
         position ASC
       LIMIT 1;
       
       -- If suitable target stage found
       IF v_target_stage_id IS NOT NULL THEN
          DECLARE
            v_target_pos int;
          BEGIN
            SELECT position INTO v_target_pos FROM ticket_stages WHERE id = v_target_stage_id;
            
            -- Only move if current stage is "lower" (earlier) than target
            -- e.g. "Recibido" (0) < "En Análisis" (2) -> OK
            -- e.g. "En Progreso" (3) < "En Análisis" (2) -> NO (don't move backward)
            IF v_stage_pos < v_target_pos THEN
               UPDATE tickets SET stage_id = v_target_stage_id, updated_at = NOW() WHERE id = NEW.ticket_id;
            END IF;
          END;
       END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
