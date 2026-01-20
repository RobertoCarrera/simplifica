-- Migration: 20260126173000_enterprise_tickets.sql

-- 1. Create Ticket Timeline (Audit Trail for UI)
CREATE TABLE IF NOT EXISTS public.ticket_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Who did it
    event_type TEXT NOT NULL, -- 'creation', 'stage_change', 'priority_change', 'assignment_change', 'comment'
    metadata JSONB DEFAULT '{}'::jsonb, -- Store details { from:_ , to: _ }
    is_public BOOLEAN DEFAULT false, -- If true, client can see it
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices for Timeline
CREATE INDEX IF NOT EXISTS idx_ticket_timeline_ticket ON public.ticket_timeline(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_timeline_created ON public.ticket_timeline(created_at);

-- RLS for Timeline
ALTER TABLE public.ticket_timeline ENABLE ROW LEVEL SECURITY;

-- Policy: Staff can view all timeline events for their company
CREATE POLICY "staff_view_timeline" ON public.ticket_timeline
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = ticket_timeline.company_id
      AND u.active = true
  )
);

-- Policy: Clients can view ONLY public events for their tickets
CREATE POLICY "client_view_timeline" ON public.ticket_timeline
FOR SELECT TO authenticated
USING (
  ticket_timeline.is_public = true AND
  EXISTS (
    SELECT 1 FROM public.tickets t
    JOIN public.clients c ON t.client_id = c.id
    WHERE t.id = ticket_timeline.ticket_id
      AND c.auth_user_id = auth.uid()
  )
);

-- 2. Add SLA Columns to Tickets
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'first_response_at') THEN
        ALTER TABLE public.tickets ADD COLUMN first_response_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'resolution_time_mins') THEN
        ALTER TABLE public.tickets ADD COLUMN resolution_time_mins INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'sla_status') THEN
        ALTER TABLE public.tickets ADD COLUMN sla_status TEXT DEFAULT 'ok'; -- 'ok', 'warning', 'breached'
    END IF;
END $$;

-- 3. Trigger Function: Log Ticket Changes to Timeline
CREATE OR REPLACE FUNCTION public.handle_ticket_audit_log()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_event_type TEXT;
    v_metadata JSONB;
BEGIN
    -- Only run on UPDATE
    IF TG_OP = 'UPDATE' THEN
        
        -- Check Stage Change
        IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
            INSERT INTO public.ticket_timeline (ticket_id, company_id, actor_id, event_type, metadata, is_public)
            VALUES (
                NEW.id, 
                NEW.company_id, 
                v_actor_id, 
                'stage_change', 
                jsonb_build_object('from', OLD.stage_id, 'to', NEW.stage_id), 
                true -- Stage changes are usually public? Let's say yes for now, or make configurable.
            );
        END IF;

        -- Check Priority Change
        IF OLD.priority IS DISTINCT FROM NEW.priority THEN
            INSERT INTO public.ticket_timeline (ticket_id, company_id, actor_id, event_type, metadata, is_public)
            VALUES (
                NEW.id, 
                NEW.company_id, 
                v_actor_id, 
                'priority_change', 
                jsonb_build_object('from', OLD.priority, 'to', NEW.priority), 
                false -- Priority is usually internal
            );
        END IF;

        -- Check Assignment Change
        IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
            INSERT INTO public.ticket_timeline (ticket_id, company_id, actor_id, event_type, metadata, is_public)
            VALUES (
                NEW.id, 
                NEW.company_id, 
                v_actor_id, 
                'assignment_change', 
                jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to), 
                false -- Internal
            );
        END IF;

        -- SLA Calculation: Resolution Time
        IF NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL THEN
            -- Ticket just closed
            NEW.resolution_time_mins := EXTRACT(EPOCH FROM (NEW.closed_at - NEW.created_at)) / 60;
        END IF;

    ELSIF TG_OP = 'INSERT' THEN
        -- Creation Event
        INSERT INTO public.ticket_timeline (ticket_id, company_id, actor_id, event_type, metadata, is_public)
        VALUES (
            NEW.id, 
            NEW.company_id, 
            v_actor_id, 
            'creation', 
            '{}'::jsonb, 
            true
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Attach Trigger to Tickets
DROP TRIGGER IF EXISTS trg_ticket_audit ON public.tickets;
CREATE TRIGGER trg_ticket_audit
    AFTER INSERT OR UPDATE ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_ticket_audit_log();
