-- Migration: Fix Notification Trigger Role Check
-- Description: Updates handle_ticket_notifications to query company_members for role information
--              instead of the users table (where the role column does not exist).

CREATE OR REPLACE FUNCTION public.handle_ticket_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recipient_id UUID;
    -- Fix: Query company_members for role instead of users table
    -- Select user_id explicitly to match with create_notification expectations
    v_admins CURSOR FOR 
        SELECT user_id 
        FROM public.company_members 
        WHERE company_id = NEW.company_id 
        AND role IN ('owner', 'admin') 
        AND status = 'active';
BEGIN
    IF TG_OP = 'INSERT' THEN
        FOR admin_Rec IN v_admins LOOP
            -- Use admin_Rec.user_id retrieved from company_members
            PERFORM public.create_notification(NEW.company_id, admin_Rec.user_id, 'ticket_created', NEW.id, 'Nuevo Ticket #' || NEW.ticket_number, 'Se ha creado un nuevo ticket: ' || NEW.title);
        END LOOP;
        
        IF NEW.assigned_to IS NOT NULL THEN
             PERFORM public.create_notification(NEW.company_id, NEW.assigned_to, 'ticket_assigned', NEW.id, 'Ticket Asignado #' || NEW.ticket_number, 'Te han asignado el ticket: ' || NEW.title);
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND (NEW.assigned_to IS NOT NULL) THEN
            PERFORM public.create_notification(NEW.company_id, NEW.assigned_to, 'ticket_assigned', NEW.id, 'Ticket Asignado #' || NEW.ticket_number, 'Te han asignado el ticket: ' || NEW.title);
        END IF;

        IF (OLD.stage_id IS DISTINCT FROM NEW.stage_id) THEN
            IF NEW.assigned_to IS NOT NULL THEN
                PERFORM public.create_notification(NEW.company_id, NEW.assigned_to, 'ticket_status_change', NEW.id, 'Cambio de Estado Ticket #' || NEW.ticket_number, 'El estado del ticket ha cambiado.');
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
