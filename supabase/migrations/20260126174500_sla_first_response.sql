-- Migration: 20260126174500_sla_first_response.sql

-- Trigger function: Update first_response_at when a STAFF member comments
CREATE OR REPLACE FUNCTION public.handle_ticket_first_response()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_staff BOOLEAN;
BEGIN
    -- Check if ticket already has a first_response_at
    -- If not, we check if the commenter is Staff
    IF (SELECT first_response_at FROM public.tickets WHERE id = NEW.ticket_id) IS NULL THEN
        
        -- Check if user is Staff (exists in public.users)
        -- We assume 'is_internal' column on ticket_comments might exist, but safer to check user table
        SELECT EXISTS (
            SELECT 1 FROM public.users 
            WHERE auth_user_id = NEW.user_id 
              AND active = true
        ) INTO v_is_staff;

        IF v_is_staff THEN
            UPDATE public.tickets
            SET first_response_at = NEW.created_at
            WHERE id = NEW.ticket_id;
        END IF;

    END IF;

    RETURN NEW;
END;
$$;

-- Attach to ticket_comments
DROP TRIGGER IF EXISTS trg_sla_response ON public.ticket_comments;
CREATE TRIGGER trg_sla_response
    AFTER INSERT ON public.ticket_comments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticket_first_response();
