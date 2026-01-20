-- Fix: handle_ticket_auto_assignment (Correcting min(uuid) error)
-- Description: Updates the auto-assignment logic to query app_roles AND casts uuid to text for MIN().

CREATE OR REPLACE FUNCTION public.handle_ticket_auto_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_eligible_count int;
    v_assignee_id uuid;
BEGIN
    -- Only run if assigned_to is NULL
    IF NEW.assigned_to IS NULL THEN
        -- Find eligible users (owner, admin, member, agent, professional?)
        -- Using app_roles instead of legacy role column
        
        -- Fix: Cast ID to text for MIN() function
        SELECT count(*), min(u.id::text)::uuid INTO v_eligible_count, v_assignee_id
        FROM public.users u
        JOIN public.app_roles ar ON u.app_role_id = ar.id
        WHERE u.company_id = NEW.company_id
        AND ar.name IN ('owner', 'admin', 'member', 'professional', 'agent') 
        AND u.active = true;

        IF v_eligible_count = 1 THEN
            NEW.assigned_to := v_assignee_id;
        END IF; 
        
        -- If more than 1, leave unassigned
    END IF;

    RETURN NEW;
END;
$$;
