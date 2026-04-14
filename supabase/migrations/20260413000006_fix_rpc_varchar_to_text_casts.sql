-- Fix: cast varchar columns to text in RETURN QUERY to match RETURNS TABLE declarations
-- Error was: 42804 "Returned type character varying(N) does not match expected type text"
-- Root cause: table columns are varchar(200) but RETURNS TABLE declared them as text.
-- PostgreSQL doesn't coerce varchar → text implicitly in set-returning function results.

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
        u.name::text AS created_by_name,
        b.start_time AS booking_start_time,
        s.name::text AS service_name
    FROM public.booking_clinical_notes n
    JOIN public.bookings b ON n.booking_id = b.id
    LEFT JOIN public.services s ON b.service_id = s.id
    LEFT JOIN public.users u ON n.created_by = u.id
    WHERE n.client_id = p_client_id
    ORDER BY b.start_time DESC, n.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_booking_notes(uuid) TO authenticated;

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
        d.id,
        d.booking_id,
        d.client_id,
        d.file_name::text,
        d.file_path::text,
        d.file_type::text,
        d.file_size,
        NULL::text AS signed_url,
        d.created_at,
        u.name::text AS created_by_name,
        b.start_time AS booking_start_time,
        s.name::text AS service_name
    FROM public.booking_documents d
    JOIN public.bookings b ON d.booking_id = b.id
    LEFT JOIN public.services s ON b.service_id = s.id
    LEFT JOIN public.users u ON d.created_by = u.id
    WHERE d.client_id = p_client_id
    ORDER BY b.start_time DESC, d.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_booking_documents(uuid) TO authenticated;
