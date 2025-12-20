-- Consolidated Automation Fixes
-- 1. Fix "Recibido" -> "En Análisis" (handling position 0 vs 0 issue)
-- 2. Ensure "Delete" -> "Cancelado" works

-- A) FIX COMMENT AUTOMATION (Staff Comment -> En Análisis)
CREATE OR REPLACE FUNCTION handle_ticket_comment_automation()
RETURNS TRIGGER AS $$
DECLARE
  v_stage_id uuid;
  v_stage_pos int;
  v_stage_workflow text; -- NEW: track current workflow
  v_target_stage_id uuid;
  v_user_comment_count int;
BEGIN
  -- 1. Client Logic: DO NOT update stage automatically
  IF NEW.client_id IS NOT NULL THEN
     RETURN NEW; 
  END IF;

  -- 2. Staff Logic: First comment moves to 'En Análisis'
  IF NEW.user_id IS NOT NULL THEN
    -- Check if this is the FIRST comment by a staff member
    SELECT count(*) INTO v_user_comment_count 
    FROM ticket_comments 
    WHERE ticket_id = NEW.ticket_id AND user_id IS NOT NULL;
    
    IF v_user_comment_count = 1 THEN
       -- Get current stage info including WORKFLOW_CATEGORY
       SELECT id, position, workflow_category INTO v_stage_id, v_stage_pos, v_stage_workflow
       FROM ticket_stages
       WHERE id = (SELECT stage_id FROM tickets WHERE id = NEW.ticket_id);
       
       -- Find 'En Análisis' stage
       SELECT id INTO v_target_stage_id
       FROM ticket_stages
       WHERE 
         (company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id) OR company_id IS NULL)
         AND deleted_at IS NULL
         AND (name ILIKE '%Análisis%' OR workflow_category = 'analysis')
         -- Avoid hidden stages
         AND NOT EXISTS (
            SELECT 1 FROM hidden_stages hs 
            WHERE hs.stage_id = ticket_stages.id 
            AND hs.company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id)
         )
       ORDER BY (company_id IS NOT NULL) DESC, (workflow_category = 'analysis') DESC, position ASC
       LIMIT 1;
       
       -- If target found AND it is different from current
       IF v_target_stage_id IS NOT NULL AND v_target_stage_id != v_stage_id THEN
          DECLARE
            v_target_pos int;
          BEGIN
            SELECT position INTO v_target_pos FROM ticket_stages WHERE id = v_target_stage_id;
            
            -- ALLOW MOVE IF:
            -- 1. Current stage is 'waiting' or 'open' (e.g. "Recibido") -> advancing to analysis is always logically ahead
            -- 2. OR Current position < Target position (standard logic)
            IF (v_stage_workflow IN ('waiting', 'open')) OR (v_stage_pos < v_target_pos) THEN
               UPDATE tickets SET stage_id = v_target_stage_id, updated_at = NOW() WHERE id = NEW.ticket_id;
            END IF;
          END;
       END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- B) FIX DELETE AUTOMATION (Delete -> Cancelled)
CREATE OR REPLACE FUNCTION public.handle_ticket_soft_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_cancel_stage_id uuid;
BEGIN
    -- Check if ticket is being soft-deleted
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
        -- Find 'cancel' stage
        SELECT id INTO v_cancel_stage_id
        FROM public.ticket_stages
        WHERE company_id = NEW.company_id
          AND workflow_category = 'cancel'
        LIMIT 1;

        IF v_cancel_stage_id IS NOT NULL THEN
            NEW.stage_id := v_cancel_stage_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger to be safe
DROP TRIGGER IF EXISTS trigger_auto_cancel_on_delete ON public.tickets;
CREATE TRIGGER trigger_auto_cancel_on_delete
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticket_soft_delete();
