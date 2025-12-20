-- Add Automation Config columns to company_settings
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS ticket_stage_on_delete uuid REFERENCES public.ticket_stages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ticket_stage_on_staff_reply uuid REFERENCES public.ticket_stages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS ticket_stage_on_client_reply uuid REFERENCES public.ticket_stages(id) ON DELETE SET NULL;

-- 1. UPDATE SOFT DELETE TRIGGER to use config
CREATE OR REPLACE FUNCTION public.handle_ticket_soft_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_cancel_stage_id uuid;
    v_config_stage_id uuid;
BEGIN
    -- Check if ticket is being soft-deleted
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
        
        -- 1. Check Company Settings FIRST
        SELECT ticket_stage_on_delete INTO v_config_stage_id
        FROM public.company_settings
        WHERE company_id = NEW.company_id;

        IF v_config_stage_id IS NOT NULL THEN
             -- Use configured stage
             v_cancel_stage_id := v_config_stage_id;
        ELSE
             -- 2. Fallback: Find 'cancel' stage (CHECK BOTH COMPANY AND GLOBAL)
            SELECT id INTO v_cancel_stage_id
            FROM public.ticket_stages
            WHERE (company_id = NEW.company_id OR company_id IS NULL)
              AND workflow_category = 'cancel'
            -- Prefer company specific, then global
            ORDER BY (company_id IS NOT NULL) DESC
            LIMIT 1;
        END IF;

        IF v_cancel_stage_id IS NOT NULL THEN
            NEW.stage_id := v_cancel_stage_id;
            NEW.is_opened := false; -- Explicitly close it
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. UPDATE COMMENT AUTOMATION TRIGGER to use config
CREATE OR REPLACE FUNCTION handle_ticket_comment_automation()
RETURNS TRIGGER AS $$
DECLARE
  v_stage_id uuid;
  v_stage_pos int;
  v_stage_workflow text;
  v_target_stage_id uuid;
  v_user_comment_count int;
  v_config_staff_reply_stage uuid;
  v_config_client_reply_stage uuid;
BEGIN
  -- A) CLIENT REPLY
  IF NEW.client_id IS NOT NULL THEN
      -- Check setting for client reply
      SELECT ticket_stage_on_client_reply INTO v_config_client_reply_stage
      FROM public.company_settings
      WHERE company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id);
      
      IF v_config_client_reply_stage IS NOT NULL THEN
         UPDATE tickets SET stage_id = v_config_client_reply_stage, updated_at = NOW() WHERE id = NEW.ticket_id;
      END IF;
      -- If Not configured, do nothing (default behavior for now, or could act 'waiting')
      RETURN NEW; 
  END IF;

  -- B) STAFF REPLY
  IF NEW.user_id IS NOT NULL THEN
    SELECT count(*) INTO v_user_comment_count 
    FROM ticket_comments 
    WHERE ticket_id = NEW.ticket_id AND user_id IS NOT NULL;
    
    -- Only automate on FIRST staff comment? 
    -- User might want EVERY staff comment to move to 'On Progress'?
    -- Let's keep "First Comment" logic for the DEFAULT behavior.
    -- BUT if `ticket_stage_on_staff_reply` is set, should we do it ALWAYS or just FIRST?
    -- Usually "First Response" is the key transition. 
    -- If we do it always, we might overwrite manual changes.
    -- Let's stick to "First Comment" constraint even for Configured Stage, UNLESS user explicitly asked "When I reply, move to X".
    -- Safer: Stick to First Comment constraint for now to avoid annoyance.
    
    IF v_user_comment_count = 1 THEN
       
       -- 1. Check Settings
       SELECT ticket_stage_on_staff_reply INTO v_config_staff_reply_stage
       FROM public.company_settings
       WHERE company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id);

       IF v_config_staff_reply_stage IS NOT NULL THEN
          v_target_stage_id := v_config_staff_reply_stage;
       ELSE
           -- 2. Default Logic: Find 'En Análisis'
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
       END IF;

       -- Validations (Current != Target)
       SELECT id, position, workflow_category INTO v_stage_id, v_stage_pos, v_stage_workflow
       FROM ticket_stages
       WHERE id = (SELECT stage_id FROM tickets WHERE id = NEW.ticket_id);
       
       IF v_target_stage_id IS NOT NULL AND v_target_stage_id != v_stage_id THEN
          DECLARE
            v_target_pos int;
          BEGIN
            SELECT position INTO v_target_pos FROM ticket_stages WHERE id = v_target_stage_id;
            
            -- ALLOW MOVE IF: Current is 'waiting'/'open' OR strictly lower OR (Configured Setting override safety checks? No, keeps strictness unless configured?)
            -- If user configured it, we should probably allows it comfortably.
            -- Let's keep the check: Only advance forward or from open/waiting.
            -- If Configured, we assume user wants it. Maybe skip check?
            -- Let's skip check IF v_config_staff_reply_stage IS NOT NULL.
            
            IF v_config_staff_reply_stage IS NOT NULL OR (v_stage_workflow IN ('waiting', 'open')) OR (v_stage_pos < v_target_pos) THEN
               UPDATE tickets SET stage_id = v_target_stage_id, updated_at = NOW() WHERE id = NEW.ticket_id;
            END IF;
          END;
       END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
