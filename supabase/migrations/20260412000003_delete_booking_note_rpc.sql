-- Migration: Add delete_booking_note RPC
-- Date: 2026-04-12
-- Reason: Add audited delete function for booking_clinical_notes

-- 8f. delete_booking_note(p_note_id uuid)
-- Deletes a clinical note (only creator can delete - audit logged via trigger)
CREATE OR REPLACE FUNCTION public.delete_booking_note(p_note_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator    uuid;
BEGIN
    -- Get note info
    SELECT created_by INTO v_creator
    FROM public.booking_clinical_notes
    WHERE id = p_note_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nota clínica no encontrada';
    END IF;

    -- Check if user is creator (RLS will also enforce this)
    IF v_creator != (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) THEN
        -- Check if admin/owner
        IF NOT EXISTS (
            SELECT 1 FROM public.booking_clinical_notes bcn
            JOIN public.bookings b ON bcn.booking_id = b.id
            JOIN public.clients c ON b.client_id = c.id
            JOIN public.company_members cm ON c.company_id = cm.company_id
            JOIN public.app_roles ar ON cm.role_id = ar.id
            WHERE bcn.id = p_note_id
              AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
              AND cm.status = 'active'
              AND ar.name IN ('owner', 'admin', 'super_admin')
        ) THEN
            RAISE EXCEPTION 'Access denied: solo el creador o admin pueden eliminar esta nota';
        END IF;
    END IF;

    DELETE FROM public.booking_clinical_notes WHERE id = p_note_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_booking_note(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_booking_note(uuid) TO authenticated;
