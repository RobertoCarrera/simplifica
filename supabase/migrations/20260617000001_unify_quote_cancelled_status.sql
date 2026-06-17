-- ============================================================================
-- booking-driven-quote-lifecycle-ext — unify quote cancelled status
-- ============================================================================
-- Fixes client_cancel_booking RPC: was setting quote.status='rejected' when
-- a client cancels a booking; correct value is 'cancelled' (matches the
-- trigger that fires on the CRM-side cancel path). 'rejected' remains the
-- status for commercial quote rejection (different intent).
--
-- Also migrates the 9 quotes currently in 'rejected' that came from this
-- buggy RPC path (rejected + linked to a cancelled booking).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.client_cancel_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'temp'
AS $function$
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
    -- FIX (booking-driven-quote-lifecycle-ext): was 'rejected', which conflates
    -- with commercial quote rejection. Booking cancellation marks the quote as
    -- 'cancelled' — the trigger does the same for the CRM-side cancel path.
    IF v_booking.quote_id IS NOT NULL THEN
        UPDATE public.quotes
        SET status = 'cancelled',
            updated_at = NOW()
        WHERE id = v_booking.quote_id;
    END IF;

    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- One-time data fix: migrate the 9 quotes that ended up in 'rejected' from
-- the buggy RPC path. The selection criterion is: rejected + linked to a
-- cancelled booking. Quotes in 'rejected' for other reasons (commercial
-- rejection by the client) are left untouched.
DO $$
DECLARE
    v_count int;
    v_remaining int;
BEGIN
    UPDATE public.quotes q
    SET status = 'cancelled',
        updated_at = now()
    WHERE q.status = 'rejected'
      AND q.booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = q.booking_id AND b.status = 'cancelled'
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Migrated % rejected quotes to cancelled (from booking cancel path)', v_count;

    SELECT count(*) INTO v_remaining
    FROM public.quotes q
    WHERE q.status = 'rejected'
      AND q.booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = q.booking_id AND b.status = 'cancelled'
      );

    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Post-migration sanity: % quotes still in rejected from cancel path', v_remaining;
    END IF;
END $$;