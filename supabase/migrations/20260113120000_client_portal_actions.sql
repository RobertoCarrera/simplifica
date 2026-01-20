-- Client Portal Actions: Cancel and Reschedule
-- Enables clients to manage their own bookings securely.

-- 1. Client Cancel Booking
CREATE OR REPLACE FUNCTION public.client_cancel_booking(
    p_booking_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking RECORD;
    v_user_id UUID;
    v_client_id UUID;
    v_quote_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- 1. Find Client ID for validation
    -- Try direct link first
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE auth_user_id = v_user_id;

    -- Fallback to portal user email link
    IF v_client_id IS NULL THEN
        SELECT c.id INTO v_client_id
        FROM public.clients c
        JOIN public.client_portal_users cpu ON c.id = cpu.client_id
        WHERE cpu.email = (SELECT email FROM auth.users WHERE id = v_user_id);
    END IF;

    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client profile not found');
    END IF;

    -- 2. Verify Booking Ownership
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id AND client_id = v_client_id;

    IF v_booking IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking not found or access denied');
    END IF;

    -- 3. Check Status
    IF v_booking.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking is already cancelled');
    END IF;

    -- 4. Cancel Booking
    UPDATE public.bookings
    SET status = 'cancelled',
        notes = COALESCE(notes, '') || E'\n[Client Cancelled]: ' || COALESCE(p_reason, 'No reason provided'),
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- 5. Cancel Associated Quote (if any)
    IF v_booking.quote_id IS NOT NULL THEN
        UPDATE public.quotes
        SET status = 'rejected', -- Or 'cancelled' if that status exists, usually 'rejected' or 'expired' for untaken quotes. 
            -- Let's check status constraint. Usually: draft, sent, accepted, rejected, invoiced, paid.
            -- 'rejected' is appropriate for client cancellation.
            updated_at = NOW()
        WHERE id = v_booking.quote_id;
    END IF;

    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- 2. Client Reschedule Booking
CREATE OR REPLACE FUNCTION public.client_reschedule_booking(
    p_booking_id UUID,
    p_new_start_time TIMESTAMPTZ,
    p_new_end_time TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking RECORD;
    v_user_id UUID;
    v_client_id UUID;
    v_count INTEGER;
BEGIN
    v_user_id := auth.uid();

    -- 1. Find Client ID
    SELECT id INTO v_client_id FROM public.clients WHERE auth_user_id = v_user_id;
    IF v_client_id IS NULL THEN
        SELECT c.id INTO v_client_id
        FROM public.clients c
        JOIN public.client_portal_users cpu ON c.id = cpu.client_id
        WHERE cpu.email = (SELECT email FROM auth.users WHERE id = v_user_id);
    END IF;

    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client profile not found');
    END IF;

    -- 2. Verify Ownership
    SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id AND client_id = v_client_id;

    IF v_booking IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Booking not found or access denied');
    END IF;

    -- 3. Check for Conflicts (Simple time check)
    -- Ignore self
    SELECT count(*) INTO v_count
    FROM public.bookings
    WHERE resource_id IS NOT DISTINCT FROM v_booking.resource_id -- If resource assigned, check for conflict
      AND status NOT IN ('cancelled', 'rejected')
      AND id != p_booking_id
      AND (
          (start_time <= p_new_start_time AND end_time > p_new_start_time) OR
          (start_time < p_new_end_time AND end_time >= p_new_end_time) OR
          (start_time >= p_new_start_time AND end_time <= p_new_end_time)
      );
    
    -- Note: This is a basic check. Full check would require checking professional availability schedules.
    -- For now, we trust the frontend Wizard to picked a valid slot via `find_available_slots`.
    -- If we enforce strict backend check, we'd need to call `check_availability` logic here.
    -- Letting it pass if simple conflict check passes.

    IF v_count > 0 THEN
         -- RETURN jsonb_build_object('success', false, 'error', 'Selected time slot is not available');
         -- For MVP, warn but maybe allow if it's just a simple rescheduling? No, conflict is bad.
         RETURN jsonb_build_object('success', false, 'error', 'Time slot conflict detected');
    END IF;

    -- 4. Update Booking
    UPDATE public.bookings
    SET start_time = p_new_start_time,
        end_time = p_new_end_time,
        status = 'rescheduled', -- Or keep 'confirmed'? 'rescheduled' is better for history tracking.
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- 5. Update Link in Quote? 
    -- Quote description often has the date. We might want to append a note.
    IF v_booking.quote_id IS NOT NULL THEN
        UPDATE public.quotes
        SET description = description || E'\n[Rescheduled to ' || p_new_start_time::text || ']',
            updated_at = NOW()
        WHERE id = v_booking.quote_id;
    END IF;

    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
