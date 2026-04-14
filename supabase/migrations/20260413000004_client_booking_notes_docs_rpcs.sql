-- RPCs for Historial Clínico: client-level access to booking_clinical_notes and booking_documents
-- Also: count_booking_documents for Agenda (same privacy pattern as count_booking_notes)

-- =====================================================================
-- 1. count_booking_documents(p_booking_id)
--    Returns count only -- used in Agenda (write-only zone for docs)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.count_booking_documents(p_booking_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_has_access boolean;
    v_count      integer;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.bookings b
        JOIN public.clients c ON b.client_id = c.id
        JOIN public.company_members cm ON c.company_id = cm.company_id
        WHERE b.id = p_booking_id
          AND cm.user_id = (SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid())
          AND cm.status = 'active'
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RETURN 0;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.booking_documents
    WHERE booking_id = p_booking_id;

    RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.count_booking_documents(uuid) TO authenticated;

-- =====================================================================
-- 2. get_client_booking_notes(p_client_id)
--    Returns ALL decrypted notes for a client, with booking context.
--    Used in Historial Clínico.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_client_booking_notes(p_client_id uuid)
RETURNS TABLE(
    id                  uuid,
    booking_id          uuid,
    client_id           uuid,
    content             text,
    created_at          timestamptz,
    created_by_name     text,
    booking_start_time  timestamptz,
    service_name        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_has_access boolean;
BEGIN
    -- Verify caller is an active company member for this client's company
    SELECT EXISTS (
        SELECT 1 FROM public.clients c
        JOIN public.company_members cm ON c.company_id = cm.company_id
        WHERE c.id = p_client_id
          AND cm.user_id = (SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid())
          AND cm.status = 'active'
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied: user is not an active member of this client''s company';
    END IF;

    RETURN QUERY
    SELECT
        n.id,
        n.booking_id,
        n.client_id,
        extensions.pgp_sym_decrypt(
            n.content::bytea,
            (SELECT ds.decrypted_secret FROM vault.decrypted_secrets ds
             WHERE ds.name = 'clinical_encryption_key_v' || n.key_version::TEXT)
        ) AS content,
        n.created_at,
        u.name AS created_by_name,
        b.start_time AS booking_start_time,
        s.name AS service_name
    FROM public.booking_clinical_notes n
    JOIN public.bookings b ON n.booking_id = b.id
    LEFT JOIN public.services s ON b.service_id = s.id
    LEFT JOIN public.users u ON n.created_by = u.id
    WHERE n.client_id = p_client_id
    ORDER BY b.start_time DESC, n.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_booking_notes(uuid) TO authenticated;

-- =====================================================================
-- 3. get_client_booking_documents(p_client_id)
--    Returns ALL document metadata for a client, with booking context.
--    Signed URLs are generated client-side (same pattern as get_booking_documents).
--    Used in Historial Clínico.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_client_booking_documents(p_client_id uuid)
RETURNS TABLE(
    id                  uuid,
    booking_id          uuid,
    client_id           uuid,
    file_name           text,
    file_path           text,
    file_type           text,
    file_size           bigint,
    signed_url          text,
    created_at          timestamptz,
    created_by_name     text,
    booking_start_time  timestamptz,
    service_name        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_has_access boolean;
BEGIN
    -- Verify caller is an active company member for this client's company
    SELECT EXISTS (
        SELECT 1 FROM public.clients c
        JOIN public.company_members cm ON c.company_id = cm.company_id
        WHERE c.id = p_client_id
          AND cm.user_id = (SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid())
          AND cm.status = 'active'
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied: user is not an active member of this client''s company';
    END IF;

    -- signed_url returned as NULL; the client generates it via storage SDK
    RETURN QUERY
    SELECT
        d.id,
        d.booking_id,
        d.client_id,
        d.file_name,
        d.file_path,
        d.file_type,
        d.file_size,
        NULL::text AS signed_url,
        d.created_at,
        u.name AS created_by_name,
        b.start_time AS booking_start_time,
        s.name AS service_name
    FROM public.booking_documents d
    JOIN public.bookings b ON d.booking_id = b.id
    LEFT JOIN public.services s ON b.service_id = s.id
    LEFT JOIN public.users u ON d.created_by = u.id
    WHERE d.client_id = p_client_id
    ORDER BY b.start_time DESC, d.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_booking_documents(uuid) TO authenticated;
