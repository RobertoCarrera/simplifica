-- Migration: 20260126183000_tags_and_notifications.sql

-- PART 1: TAGS SYSTEM

CREATE TABLE IF NOT EXISTS public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6b7280',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS public.ticket_tags (
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (ticket_id, tag_id)
);

-- RLS for Tags
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_tags" ON public.tags
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = tags.company_id
      AND u.active = true
  )
);

CREATE POLICY "staff_manage_ticket_tags" ON public.ticket_tags
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tickets t
    JOIN public.users u ON u.company_id = t.company_id
    WHERE t.id = ticket_tags.ticket_id
      AND u.auth_user_id = auth.uid()
      AND u.active = true
  )
);

-- PART 2: NOTIFICATION TRIGGERS

-- Function to create notification safely
CREATE OR REPLACE FUNCTION public.create_notification(
    p_company_id UUID,
    p_recipient_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_content TEXT,
    p_reference_id UUID,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.notifications (company_id, recipient_id, type, title, content, reference_id, metadata)
    VALUES (p_company_id, p_recipient_id, p_type, p_title, p_content, p_reference_id, p_metadata)
    RETURNING id INTO v_id;
    RETURN v_id;
EXCEPTION WHEN OTHERS THEN
    -- Prevent notification errors from blocking the main transaction
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- TRIGGER 1: On Ticket Assignment Change
CREATE OR REPLACE FUNCTION public.handle_ticket_assignment_notification()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
BEGIN
    -- Only if assigned_to changed and is not null
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
        -- Don't notify if I assigned it to myself
        IF NEW.assigned_to != v_actor_id THEN
            PERFORM public.create_notification(
                NEW.company_id,
                NEW.assigned_to, -- Recipient is the new assignee (auth_user_id)
                'ticket_assignment',
                'Ticket Asignado',
                'Se te ha asignado el ticket #' || NEW.ticket_number || ': ' || NEW.title,
                NEW.id,
                jsonb_build_object('ticket_number', NEW.ticket_number)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_assignment ON public.tickets;
CREATE TRIGGER trg_notify_assignment
    AFTER UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticket_assignment_notification();


-- TRIGGER 2: On Ticket Priority Critical
CREATE OR REPLACE FUNCTION public.handle_ticket_critical_notification()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_owner_id UUID;
BEGIN
    -- If priority changed to critical
    IF NEW.priority = 'critical' AND (OLD.priority != 'critical' OR OLD.priority IS NULL) THEN
        
        -- Find Company Owner(s) to notify
        -- Assuming 'owner' role or similar. For now, notify the Assignee if exists, otherwise try to find an owner.
        -- Simplification: Notify Assignee if exists.
        IF NEW.assigned_to IS NOT NULL THEN
             PERFORM public.create_notification(
                NEW.company_id,
                NEW.assigned_to,
                'ticket_critical',
                'Ticket CRÍTICO',
                'El ticket #' || NEW.ticket_number || ' es ahora CRÍTICO.',
                NEW.id,
                jsonb_build_object('priority', 'critical')
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_critical ON public.tickets;
CREATE TRIGGER trg_notify_critical
    AFTER UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticket_critical_notification();


-- TRIGGER 3: On Client Comment -> Notify Assignee
CREATE OR REPLACE FUNCTION public.handle_ticket_comment_notification()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_client BOOLEAN;
    v_assignee UUID;
    v_ticket_number TEXT;
    v_ticket_title TEXT;
BEGIN
    -- Check if author is a client
    SELECT EXISTS (SELECT 1 FROM public.clients WHERE auth_user_id = NEW.user_id) INTO v_is_client;

    IF v_is_client THEN
        -- Get Ticket details
        SELECT assigned_to, ticket_number, title INTO v_assignee, v_ticket_number, v_ticket_title
        FROM public.tickets 
        WHERE id = NEW.ticket_id;

        IF v_assignee IS NOT NULL THEN
             PERFORM public.create_notification(
                NEW.company_id,
                v_assignee,
                'ticket_comment',
                'Nuevo Comentario de Cliente',
                'Cliente comentó en ticket #' || v_ticket_number,
                NEW.ticket_id,
                jsonb_build_object('comment_id', NEW.id)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_client_comment ON public.ticket_comments;
CREATE TRIGGER trg_notify_client_comment
    AFTER INSERT ON public.ticket_comments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticket_comment_notification();
