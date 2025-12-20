-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, -- User who sees this
    type TEXT NOT NULL, -- e.g. 'ticket_created', 'ticket_assigned', 'ticket_status_change', 'ticket_comment'
    reference_id UUID NOT NULL, -- e.g. ticket_id
    title TEXT NOT NULL,
    content TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT fk_reference_ticket FOREIGN KEY (reference_id) REFERENCES public.tickets(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT
    USING (auth.uid() IN (
        SELECT auth_user_id FROM public.users WHERE id = recipient_id
    ));

-- Policy: Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE
    USING (auth.uid() IN (
        SELECT auth_user_id FROM public.users WHERE id = recipient_id
    ));

-- Indexes
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id);
CREATE INDEX idx_notifications_company ON public.notifications(company_id);
CREATE INDEX idx_notifications_unread ON public.notifications(recipient_id) WHERE is_read = false;

-- Function to create notification
CREATE OR REPLACE FUNCTION public.create_notification(
    p_company_id UUID,
    p_recipient_id UUID,
    p_type TEXT,
    p_reference_id UUID,
    p_title TEXT,
    p_content TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.notifications (company_id, recipient_id, type, reference_id, title, content, metadata)
    VALUES (p_company_id, p_recipient_id, p_type, p_reference_id, p_title, p_content, p_metadata)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger Function: Ticket Changes
CREATE OR REPLACE FUNCTION public.handle_ticket_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_recipient_id UUID;
    v_admins CURSOR FOR SELECT id FROM public.users WHERE company_id = NEW.company_id AND role IN ('owner', 'admin') AND active = true;
BEGIN
    -- 1. New Ticket Created
    IF TG_OP = 'INSERT' THEN
        -- Notify Admins/Owner
        FOR admin_Rec IN v_admins LOOP
            PERFORM public.create_notification(
                NEW.company_id,
                admin_Rec.id,
                'ticket_created',
                NEW.id,
                'Nuevo Ticket #' || NEW.ticket_number,
                'Se ha creado un nuevo ticket: ' || NEW.title
            );
        END LOOP;
        
        -- If assigned immediately, notify agent
        IF NEW.assigned_to IS NOT NULL THEN
             PERFORM public.create_notification(
                NEW.company_id,
                NEW.assigned_to,
                'ticket_assigned',
                NEW.id,
                'Ticket Asignado #' || NEW.ticket_number,
                'Te han asignado el ticket: ' || NEW.title
            );
        END IF;

    -- 2. Ticket Updated
    ELSIF TG_OP = 'UPDATE' THEN
        -- Assignment Change
        IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND (NEW.assigned_to IS NOT NULL) THEN
            PERFORM public.create_notification(
                NEW.company_id,
                NEW.assigned_to,
                'ticket_assigned',
                NEW.id,
                'Ticket Asignado #' || NEW.ticket_number,
                'Te han asignado el ticket: ' || NEW.title
            );
        END IF;

        -- Status Change
        IF (OLD.stage_id IS DISTINCT FROM NEW.stage_id) THEN
            -- Notify Assigned Agent if exists
            IF NEW.assigned_to IS NOT NULL THEN
                PERFORM public.create_notification(
                    NEW.company_id,
                    NEW.assigned_to,
                    'ticket_status_change',
                    NEW.id,
                    'Cambio de Estado Ticket #' || NEW.ticket_number,
                    'El estado del ticket ha cambiado.'
                );
            END IF;
            -- TODO: Notify Client? (Skipping for now to avoid spamming clients without preference check)
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Ticket Notifications
DROP TRIGGER IF EXISTS trigger_ticket_notifications ON public.tickets;
CREATE TRIGGER trigger_ticket_notifications
    AFTER INSERT OR UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticket_notifications();

-- Trigger Function: New Comment
CREATE OR REPLACE FUNCTION public.handle_comment_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket RECORD;
BEGIN
    SELECT * INTO v_ticket FROM public.tickets WHERE id = NEW.ticket_id;
    
    -- If Internal, only notify assigned agent (if not the author)
    IF NEW.is_internal THEN
        IF v_ticket.assigned_to IS NOT NULL AND v_ticket.assigned_to != NEW.user_id THEN
            PERFORM public.create_notification(
                v_ticket.company_id,
                v_ticket.assigned_to,
                'ticket_comment_internal',
                NEW.ticket_id,
                'Nota Interna en Ticket #' || v_ticket.ticket_number,
                'Nueva nota interna: ' || left(NEW.comment, 50) || '...'
            );
        END IF;
    ELSE
        -- Public Comment
        -- Notify Assigned Agent (if not author)
        IF v_ticket.assigned_to IS NOT NULL AND v_ticket.assigned_to != NEW.user_id THEN
             PERFORM public.create_notification(
                v_ticket.company_id,
                v_ticket.assigned_to,
                'ticket_comment',
                NEW.ticket_id,
                'Nuevo Comentario en Ticket #' || v_ticket.ticket_number,
                'Nuevo comentario: ' || left(NEW.comment, 50) || '...'
            );
        END IF;
        
        -- Also notify Admins if no agent assigned? (Optional, skipping for noise reduction)
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Comment Notifications
DROP TRIGGER IF EXISTS trigger_comment_notifications ON public.ticket_comments;
CREATE TRIGGER trigger_comment_notifications
    AFTER INSERT ON public.ticket_comments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_comment_notifications();
