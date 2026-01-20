-- Create booking_history table
CREATE TABLE IF NOT EXISTS public.booking_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    changed_by UUID, -- References auth.users(id) technically, but we might want public.users. Let's store auth_user_id for now as it is safest in triggers.
    changed_by_user_id UUID REFERENCES public.users(id), -- Resolved public user id
    previous_status TEXT,
    new_status TEXT,
    change_type TEXT NOT NULL, -- 'create', 'update', 'cancel', 'reschedule'
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    company_id UUID NOT NULL REFERENCES public.companies(id)
);

-- Enable RLS
ALTER TABLE public.booking_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Booking history viewable by company members" ON public.booking_history
    FOR SELECT USING (
        company_id IN (
            SELECT cm.company_id
            FROM public.company_members cm
            JOIN public.users u ON u.id = cm.user_id
            WHERE u.auth_user_id = auth.uid()
        )
    );

-- Trigger Function
CREATE OR REPLACE FUNCTION log_booking_changes()
RETURNS TRIGGER AS $$
DECLARE
    current_auth_id UUID;
    current_public_user_id UUID;
    audit_company_id UUID;
    change_details JSONB := '{}'::jsonb;
    ch_type TEXT := 'update';
BEGIN
    current_auth_id := auth.uid();
    
    -- Try to find public user id
    SELECT id INTO current_public_user_id FROM public.users WHERE auth_user_id = current_auth_id LIMIT 1;

    -- Determine operation
    IF (TG_OP = 'INSERT') THEN
        ch_type := 'create';
        audit_company_id := NEW.company_id;
        change_details := jsonb_build_object('event', 'Booking Created');
    ELSIF (TG_OP = 'UPDATE') THEN
        audit_company_id := NEW.company_id;
        
        -- Default type
        ch_type := 'update';

        -- Detect Status Change
        IF OLD.status IS DISTINCT FROM NEW.status THEN
             IF NEW.status = 'cancelled' THEN
                ch_type := 'cancel';
             ELSE
                ch_type := 'status_change';
             END IF;
             change_details := change_details || jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status);
        END IF;
        
        -- Detect Reschedule
        IF OLD.start_time IS DISTINCT FROM NEW.start_time OR OLD.end_time IS DISTINCT FROM NEW.end_time THEN
             ch_type := 'reschedule';
             change_details := change_details || jsonb_build_object('old_start', OLD.start_time, 'new_start', NEW.start_time);
        END IF;

         -- Detect Resource/Professional Change
        IF OLD.resource_id IS DISTINCT FROM NEW.resource_id THEN
             change_details := change_details || jsonb_build_object('action', 'Resource Changed', 'old_resource', OLD.resource_id, 'new_resource', NEW.resource_id);
        END IF;
        IF OLD.professional_id IS DISTINCT FROM NEW.professional_id THEN
             change_details := change_details || jsonb_build_object('action', 'Professional Changed', 'old_prof', OLD.professional_id, 'new_prof', NEW.professional_id);
        END IF;
        
    END IF;

    -- Only log if it's an insert or we have interesting updates
    -- (update timestamps often change without real data change, so filter if needed, but checking DISTINCT above helps)
    
    INSERT INTO public.booking_history (
        booking_id,
        changed_by,
        changed_by_user_id,
        previous_status,
        new_status,
        change_type,
        details,
        company_id
    ) VALUES (
        NEW.id,
        current_auth_id,
        current_public_user_id,
        CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
        NEW.status,
        ch_type,
        change_details,
        audit_company_id
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
DROP TRIGGER IF EXISTS on_booking_change ON public.bookings;
CREATE TRIGGER on_booking_change
    AFTER INSERT OR UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION log_booking_changes();
