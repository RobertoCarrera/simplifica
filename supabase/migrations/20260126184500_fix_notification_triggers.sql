-- Migration: 20260126184500_fix_notification_triggers.sql

-- FIX: Make Critical Priority notifications GLOBAL (recipient_id = NULL)
-- This ensures all staff see when a ticket becomes critical, not just the assignee.

CREATE OR REPLACE FUNCTION public.handle_ticket_critical_notification()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- If priority changed to critical
    IF NEW.priority = 'critical' AND (OLD.priority != 'critical' OR OLD.priority IS NULL) THEN
        
        -- Send GLOBAL notification (recipient_id = NULL)
        PERFORM public.create_notification(
            NEW.company_id,
            NULL, -- GLOBAL
            'ticket_critical',
            'Ticket CRÍTICO',
            'El ticket #' || NEW.ticket_number || ' (' || NEW.title || ') es ahora CRÍTICO.',
            NEW.id,
            jsonb_build_object('priority', 'critical')
        );

    END IF;
    RETURN NEW;
END;
$$;
