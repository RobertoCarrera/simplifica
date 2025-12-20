-- Final Consolidated Automation & Data Fixes (v2 Corrected)
-- 1. Automation: Fix "Delete -> Cancelled" (missing global stage check)
-- 2. Automation: Fix "Recibido -> En Análisis" (position 0 issue)
-- 3. Data: Auto-update is_opened based on stage workflow/category
-- ERROR FIX: Removed invalid 'closed' enum value. Added workflow_category check.

-- A) FIX DELETE AUTOMATION (Correctly find global 'Cancelado')
CREATE OR REPLACE FUNCTION public.handle_ticket_soft_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_cancel_stage_id uuid;
BEGIN
    -- Check if ticket is being soft-deleted
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
        -- Find 'cancel' stage (CHECK BOTH COMPANY AND GLOBAL)
        SELECT id INTO v_cancel_stage_id
        FROM public.ticket_stages
        WHERE (company_id = NEW.company_id OR company_id IS NULL)
          AND workflow_category = 'cancel'
        -- Prefer company specific, then global
        ORDER BY (company_id IS NOT NULL) DESC
        LIMIT 1;

        IF v_cancel_stage_id IS NOT NULL THEN
            NEW.stage_id := v_cancel_stage_id;
            NEW.is_opened := false; -- Explicitly close it
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply trigger
DROP TRIGGER IF EXISTS trigger_auto_cancel_on_delete ON public.tickets;
CREATE TRIGGER trigger_auto_cancel_on_delete
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticket_soft_delete();


-- B) FIX COMMENT AUTOMATION (Staff Comment -> En Análisis)
CREATE OR REPLACE FUNCTION handle_ticket_comment_automation()
RETURNS TRIGGER AS $$
DECLARE
  v_stage_id uuid;
  v_stage_pos int;
  v_stage_workflow text;
  v_target_stage_id uuid;
  v_user_comment_count int;
BEGIN
  IF NEW.client_id IS NOT NULL THEN
     RETURN NEW; 
  END IF;

  IF NEW.user_id IS NOT NULL THEN
    SELECT count(*) INTO v_user_comment_count 
    FROM ticket_comments 
    WHERE ticket_id = NEW.ticket_id AND user_id IS NOT NULL;
    
    IF v_user_comment_count = 1 THEN
       SELECT id, position, workflow_category INTO v_stage_id, v_stage_pos, v_stage_workflow
       FROM ticket_stages
       WHERE id = (SELECT stage_id FROM tickets WHERE id = NEW.ticket_id);
       
       -- Find 'En Análisis' (Robust lookup)
       SELECT id INTO v_target_stage_id
       FROM ticket_stages
       WHERE 
         (company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id) OR company_id IS NULL)
         AND deleted_at IS NULL
         AND (name ILIKE '%Análisis%' OR workflow_category = 'analysis')
         AND NOT EXISTS (
            SELECT 1 FROM hidden_stages hs 
            WHERE hs.stage_id = ticket_stages.id 
            AND hs.company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id)
         )
       ORDER BY (company_id IS NOT NULL) DESC, (workflow_category = 'analysis') DESC, position ASC
       LIMIT 1;
       
       IF v_target_stage_id IS NOT NULL AND v_target_stage_id != v_stage_id THEN
          DECLARE
            v_target_pos int;
          BEGIN
            SELECT position INTO v_target_pos FROM ticket_stages WHERE id = v_target_stage_id;
            
            -- ALLOW MOVE IF: Current stage is 'waiting'/'open' OR strictly lower position
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


-- C) AUTO-MAINTAIN is_opened COLUMN (Corrected Logic)
CREATE OR REPLACE FUNCTION public.maintain_ticket_opened_status()
RETURNS TRIGGER AS $$
DECLARE
  v_category text;
  v_workflow text;
BEGIN
  -- Get category AND workflow of the NEW stage
  SELECT stage_category, workflow_category INTO v_category, v_workflow
  FROM ticket_stages
  WHERE id = NEW.stage_id;

  -- Logic: Close if category is 'completed' OR workflow is 'cancel' or 'final'
  -- (Because some users have 'final' stages marked as 'open' category erroneously)
  IF v_category = 'completed' OR v_workflow IN ('cancel', 'final') THEN
     NEW.is_opened := false;
  ELSE
     NEW.is_opened := true;
  END IF;
  
  -- Override if deleted
  IF NEW.deleted_at IS NOT NULL THEN
     NEW.is_opened := false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_maintain_opened_status ON public.tickets;
CREATE TRIGGER trigger_maintain_opened_status
    BEFORE INSERT OR UPDATE OF stage_id, deleted_at ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.maintain_ticket_opened_status();

-- D) DATA FIX for existing tickets (Corrected Logic)
UPDATE public.tickets t
SET is_opened = (
  CASE 
    WHEN t.deleted_at IS NOT NULL THEN false
    WHEN EXISTS (
        SELECT 1 FROM ticket_stages s 
        WHERE s.id = t.stage_id 
        AND (s.stage_category = 'completed' OR s.workflow_category IN ('cancel', 'final'))
    ) THEN false
    ELSE true
  END
);
