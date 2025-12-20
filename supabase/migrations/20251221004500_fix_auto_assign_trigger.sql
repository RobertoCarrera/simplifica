-- Fix invalid min(uuid) usage in auto-assignment trigger
-- Replaces the function with corrected casting

CREATE OR REPLACE FUNCTION public.handle_ticket_auto_assignment()
RETURNS TRIGGER AS $$
DECLARE
    agent_count integer;
    sole_agent_id uuid;
BEGIN
    -- Only proceed if assigned_to is NULL
    IF NEW.assigned_to IS NULL THEN
        -- Count valid agents (owner, admin, member) for this company
        -- FIX: Cast uuid to text for MIN() function, then back to uuid
        SELECT count(*), min(id::text)::uuid
        INTO agent_count, sole_agent_id
        FROM public.users
        WHERE company_id = NEW.company_id
          AND role IN ('owner', 'admin', 'member')
          AND active = true;

        -- If exactly 1 agent exists, assign to them automatically
        IF agent_count = 1 THEN
            NEW.assigned_to := sole_agent_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
