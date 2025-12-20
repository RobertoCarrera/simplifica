-- ==============================================================================
-- MIGRATION: 20251220143000_refined_ticket_automation
-- DESCRIPTION: Refined automation rules: Force initial stage, Auto-cancel on delete.
-- ==============================================================================

-- 1. FUNCTION & TRIGGER: Force Initial Stage (Position 0) on Insert
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_initial_ticket_stage()
RETURNS TRIGGER AS $$
DECLARE
    v_initial_stage_id uuid;
BEGIN
    -- Find the stage with the lowest position for this company
    SELECT id INTO v_initial_stage_id
    FROM public.ticket_stages
    WHERE company_id = NEW.company_id
      AND deleted_at IS NULL
    ORDER BY position ASC
    LIMIT 1;

    -- If found, enforce it
    IF v_initial_stage_id IS NOT NULL THEN
        NEW.stage_id := v_initial_stage_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS ensure_initial_stage_insert ON public.tickets;
CREATE TRIGGER ensure_initial_stage_insert
    BEFORE INSERT ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.set_initial_ticket_stage();


-- 2. FUNCTION & TRIGGER: Auto-Cancel on Soft Delete
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_ticket_soft_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_cancel_stage_id uuid;
BEGIN
    -- Check if ticket is being soft-deleted (deleted_at changed from NULL to NOT NULL)
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
        
        -- Find the 'cancel' workflow stage for this company
        SELECT id INTO v_cancel_stage_id
        FROM public.ticket_stages
        WHERE company_id = NEW.company_id
          AND workflow_category = 'cancel'
          LIMIT 1;

        -- If found, move ticket to that stage
        IF v_cancel_stage_id IS NOT NULL THEN
            NEW.stage_id := v_cancel_stage_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_auto_cancel_on_delete ON public.tickets;
CREATE TRIGGER trigger_auto_cancel_on_delete
    BEFORE UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticket_soft_delete();
