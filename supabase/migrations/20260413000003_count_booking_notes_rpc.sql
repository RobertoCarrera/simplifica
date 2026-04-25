-- Migration: count_booking_notes RPC
-- Purpose: Return only the count of clinical notes for a booking (no decryption),
--          so the Agenda view can show a count indicator without exposing note content.

CREATE OR REPLACE FUNCTION public.count_booking_notes(p_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_access boolean;
BEGIN
  -- Verify the caller is an active member of the company that owns this booking
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.clients c ON b.client_id = c.id
    JOIN public.company_members cm ON c.company_id = cm.company_id
    WHERE b.id = p_booking_id
      AND cm.user_id = (
        SELECT u_auth.id FROM public.users u_auth
        WHERE u_auth.auth_user_id = auth.uid()
      )
      AND cm.status = 'active'
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (
    SELECT COUNT(*)::integer
    FROM public.booking_clinical_notes
    WHERE booking_id = p_booking_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_booking_notes(uuid) TO authenticated;
