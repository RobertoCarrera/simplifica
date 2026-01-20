-- Migration: 20260126153000_ticket_state_transitions.sql

-- 1. Add closed_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'closed_at') THEN
        ALTER TABLE public.tickets ADD COLUMN closed_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- 2. Function to handle state transitions (Auto-Close / Reopen)
CREATE OR REPLACE FUNCTION public.handle_ticket_state_transition()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    new_stage_category stage_category;
BEGIN
    -- Only run if stage_id changed
    IF (OLD.stage_id IS DISTINCT FROM NEW.stage_id) THEN
        
        -- Get category of the new stage
        -- We handle NULL stage_id gracefully just in case
        IF NEW.stage_id IS NOT NULL THEN
            SELECT stage_category INTO new_stage_category
            FROM public.ticket_stages
            WHERE id = NEW.stage_id;
            
            -- Logic: If moved to 'completed' category -> Close Ticket
            IF (new_stage_category = 'completed') THEN
                NEW.is_opened := false;
                -- Only set closed_at if it wasn't already set (preserve original close time if moving between completed states?)
                -- Actually, moving to a new completed state (e.g. Resuelto -> Cancelado) usually implies a new "end" event.
                -- Let's update it to current time.
                NEW.closed_at := NOW();
            ELSE
                -- If reopened (moved to open/in_progress/on_hold), Open Ticket
                NEW.is_opened := true;
                NEW.closed_at := NULL;
            END IF;
        END IF;

    END IF;

    RETURN NEW;
END;
$$;

-- 3. Trigger
DROP TRIGGER IF EXISTS on_ticket_stage_change ON tickets;
CREATE TRIGGER on_ticket_stage_change
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticket_state_transition();
