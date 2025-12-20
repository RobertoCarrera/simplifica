-- Restore "Auto-Cancel on Soft Delete" automation
-- User specifically requested that deleted tickets SHOULD move to "Cancelado" / "Cancelled" stage.
-- This function finds the stage with workflow_category = 'cancel' for the company and moves the ticket there.

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
