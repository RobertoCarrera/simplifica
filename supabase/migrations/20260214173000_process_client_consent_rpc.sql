-- RPCs to process client consent response (Accept / Reject)

-- 1. Accept Consent
CREATE OR REPLACE FUNCTION public.process_client_consent(
    p_token uuid,
    p_marketing_consent boolean,
    p_ip text,
    p_user_agent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client_id uuid;
    v_client_name text;
BEGIN
    SELECT id, name INTO v_client_id, v_client_name
    FROM public.clients
    WHERE invitation_token = p_token
    LIMIT 1;

    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired token');
    END IF;

    UPDATE public.clients
    SET
        consent_status = 'accepted',
        marketing_consent = p_marketing_consent,
        consent_date = NOW(),
        consent_ip = p_ip,
        invitation_status = 'completed',
        invitation_token = NULL,
        updated_at = NOW()
    WHERE id = v_client_id;

    RETURN jsonb_build_object('success', true, 'client_name', v_client_name);
END;
$$;

-- 2. Reject Consent
CREATE OR REPLACE FUNCTION public.reject_client_consent(
    p_token uuid,
    p_ip text,
    p_user_agent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client_id uuid;
BEGIN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE invitation_token = p_token
    LIMIT 1;

    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired token');
    END IF;

    UPDATE public.clients
    SET
        consent_status = 'rejected',
        marketing_consent = false,
        consent_date = NOW(),
        consent_ip = p_ip,
        invitation_status = 'completed',
        invitation_token = NULL,
        updated_at = NOW()
    WHERE id = v_client_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_client_consent(uuid, boolean, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_client_consent(uuid, text, text) TO anon, authenticated, service_role;
