-- Add is_final flag to project_stages
ALTER TABLE public.project_stages 
ADD COLUMN IF NOT EXISTS is_final BOOLEAN DEFAULT false;

-- Create unique index to ensure only one final stage per company
CREATE UNIQUE INDEX IF NOT EXISTS unique_final_stage_per_company 
ON public.project_stages (company_id) 
WHERE (is_final = true);

-- Update Function to handle auto-move logic including Final stage revert
CREATE OR REPLACE FUNCTION public.handle_project_auto_move()
RETURNS TRIGGER AS $$
DECLARE
    v_project_id UUID;
    v_company_id UUID;
    v_current_stage_id UUID;
    v_is_review_stage BOOLEAN;
    v_is_final_stage BOOLEAN;
    v_review_stage_id UUID;
    v_default_stage_id UUID;
    v_incomplete_tasks_count INTEGER;
BEGIN
    -- Determine project_id based on operation
    IF (TG_OP = 'DELETE') THEN
        v_project_id := OLD.project_id;
    ELSE
        v_project_id := NEW.project_id;
    END IF;

    -- Get project and company info
    SELECT company_id, stage_id INTO v_company_id, v_current_stage_id
    FROM public.projects
    WHERE id = v_project_id;

    -- If project not found (e.g. deleted), exit
    IF v_company_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Check if current stage is the review or final stage
    SELECT is_review, is_final INTO v_is_review_stage, v_is_final_stage
    FROM public.project_stages
    WHERE id = v_current_stage_id;

    -- Count incomplete tasks
    SELECT COUNT(*) INTO v_incomplete_tasks_count
    FROM public.project_tasks
    WHERE project_id = v_project_id AND is_completed = false;

    -- Get special stages for this company
    SELECT id INTO v_review_stage_id FROM public.project_stages WHERE company_id = v_company_id AND is_review = true LIMIT 1;
    SELECT id INTO v_default_stage_id FROM public.project_stages WHERE company_id = v_company_id AND is_default = true LIMIT 1;

    -- Logic 1: All tasks completed -> Move to Review Stage
    -- Only if NOT already in Review OR Final stage (if in Final, we stay there unless manually changed)
    IF v_incomplete_tasks_count = 0 THEN
        IF v_review_stage_id IS NOT NULL 
           AND (v_current_stage_id IS DISTINCT FROM v_review_stage_id) 
           AND (v_is_final_stage IS NOT TRUE) THEN
            
            UPDATE public.projects 
            SET stage_id = v_review_stage_id, updated_at = NOW()
            WHERE id = v_project_id;
        END IF;
    END IF;

    -- Logic 2: Not all tasks completed (reopened or new added) -> Move back to Default Stage
    -- If currently in Review OR Final Stage
    IF v_incomplete_tasks_count > 0 THEN
        IF (v_is_review_stage = true OR v_is_final_stage = true) AND v_default_stage_id IS NOT NULL THEN
             UPDATE public.projects 
            SET stage_id = v_default_stage_id, updated_at = NOW()
            WHERE id = v_project_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
