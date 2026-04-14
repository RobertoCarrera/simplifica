-- Fix: column reference "id" is ambiguous in get_booking_notes and get_booking_documents
-- Root cause: both functions use RETURNS TABLE(id uuid, ...) which creates an OUT variable named "id"
-- in the PL/pgSQL scope. The subquery (SELECT id FROM public.users ...) was ambiguous because
-- PostgreSQL couldn't distinguish between the OUT variable and the table column.
-- Fix: qualify the subquery with an explicit table alias.

CREATE OR REPLACE FUNCTION public.get_booking_notes(p_booking_id uuid)
RETURNS TABLE(
    id             uuid,
    booking_id     uuid,
    client_id      uuid,
    content        text,
    created_at     timestamptz,
    created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_has_access    boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.bookings b
        JOIN public.clients c ON b.client_id = c.id
        JOIN public.company_members cm ON c.company_id = cm.company_id
        WHERE b.id = p_booking_id
          AND cm.user_id = (SELECT u_auth.id FROM public.users u_auth WHERE u_auth.auth_user_id = auth.uid())
          AND cm.status = 'active'
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied: user is not an active member of this booking''s company';
    END IF;

    RETURN QUERY
    SELECT
        n.id,
        n.booking_id,
        n.client_id,
        extensions.pgp_sym_decrypt(
            n.content::bytea,
            (SELECT decrypted_secret FROM vault.decrypted_secrets
             WHERE name = 'clinical_encryption_key_v' || n.key_version::TEXT)
        ) AS content,
        n.created_at,
        u.name AS created_by_name
    FROM public.booking_clinical_notes n
    LEFT JOIN public.users u ON n.created_by = u.id
    WHERE n.booking_id = p_booking_id
    ORDER BY n.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_documents(p_booking_id uuid)
RETURNS TABLE(
    id             uuid,
    booking_id     uuid,
    client_id      uuid,
    file_name      text,
    file_path      text,
    file_type      text,
    file_size      bigint,
    signed_url     text,
    created_at     timestamptz,
    created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_has_access    boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.bookings b
        JOIN public.clients c ON b.client_id = c.id
        JOIN public.company_members cm ON c.company_id = cm.company_id
        WHERE b.id = p_booking_id
          AND cm.user_id = (SELECT u_auth.id FROM public.users u_auth WHERE u_auth.auth_user_id = auth.uid())
          AND cm.status = 'active'
    ) INTO v_has_access;

    IF NOT v_has_access THEN
        RAISE EXCEPTION 'Access denied: user is not an active member of this booking''s company';
    END IF;

    -- signed_url is returned as NULL here; the client generates it via storage SDK
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
        u.name AS created_by_name
    FROM public.booking_documents d
    LEFT JOIN public.users u ON d.created_by = u.id
    WHERE d.booking_id = p_booking_id
    ORDER BY d.created_at DESC;
END;
$function$;
