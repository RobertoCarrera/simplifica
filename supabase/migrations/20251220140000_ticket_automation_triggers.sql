-- Create function to handle ticket automation based on comments
CREATE OR REPLACE FUNCTION handle_ticket_comment_automation()
RETURNS TRIGGER AS $$
DECLARE
  v_stage_category text;
  v_workflow_category text;
  v_company_id uuid;
  v_target_stage_id uuid;
BEGIN
  -- Only proceed if the comment is from a client
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get current ticket info including stage category/workflow
  SELECT 
    t.company_id,
    ts.stage_category,
    ts.workflow_category
  INTO 
    v_company_id,
    v_stage_category,
    v_workflow_category
  FROM tickets t
  JOIN ticket_stages ts ON t.stage_id = ts.id
  WHERE t.id = NEW.ticket_id;

  -- Check if we need to transition
  -- Logic: If stage is 'final' (completed) OR 'waiting' (on_hold/waiting for client) -> Move to In Progress
  -- workflow_category map: 'cancel', 'waiting', 'analysis', 'action', 'final'
  -- stage_category map: 'open', 'in_progress', 'completed', 'on_hold'
  
  IF v_workflow_category IN ('final', 'waiting') OR v_stage_category IN ('completed', 'on_hold') THEN
    
    -- Find the best target stage to move to (Reopen/Resume)
    -- We prioritize 'action' or 'analysis' workflow categories, or 'in_progress' stage category
    SELECT id INTO v_target_stage_id
    FROM ticket_stages ts
    WHERE 
      (ts.company_id = v_company_id OR ts.company_id IS NULL)
      AND ts.deleted_at IS NULL
      AND (
         ts.workflow_category IN ('action', 'analysis') 
         OR ts.stage_category = 'in_progress'
      )
      -- Exclude hidden generic stages for this company
      AND NOT EXISTS (
        SELECT 1 FROM hidden_stages hs 
        WHERE hs.stage_id = ts.id 
        AND hs.company_id = v_company_id
      )
    ORDER BY 
      -- Prefer company specific stages over generic ones
      (ts.company_id IS NOT NULL) DESC,
      -- Priority: Action > Analysis > Others
      CASE 
        WHEN ts.workflow_category = 'action' THEN 1 
        WHEN ts.workflow_category = 'analysis' THEN 2 
        ELSE 3 
      END,
      -- Lower position number = earlier in the flow
      ts.position ASC
    LIMIT 1;

    -- Update the ticket if a suitable stage was found and it's different from current
    IF v_target_stage_id IS NOT NULL THEN
      UPDATE tickets 
      SET 
        stage_id = v_target_stage_id,
        updated_at = NOW()
      WHERE id = NEW.ticket_id AND stage_id != v_target_stage_id;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to allow idempotent runs (though filename is unique usually)
DROP TRIGGER IF EXISTS trigger_ticket_comment_automation ON ticket_comments;

-- Create trigger
CREATE TRIGGER trigger_ticket_comment_automation
AFTER INSERT ON ticket_comments
FOR EACH ROW
EXECUTE FUNCTION handle_ticket_comment_automation();
