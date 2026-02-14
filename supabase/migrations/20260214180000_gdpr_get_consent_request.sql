-- RPC to retrieve client consent details by token
-- Called by public consent page

CREATE OR REPLACE FUNCTION public.get_client_consent_request(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client record;
    v_company_name text;
BEGIN
    -- 1. Get Client and Company ID
    SELECT c.id, c.name, c.email, c.company_id, c.invitation_status
    INTO v_client
    FROM public.clients c
    WHERE c.invitation_token = p_token
    LIMIT 1;

    IF v_client.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token not found');
    END IF;

    IF v_client.invitation_status = 'completed' THEN
         RETURN jsonb_build_object('success', false, 'error', 'Invitation already completed');
    END IF;

    -- 2. Get Company Name
    SELECT name INTO v_company_name
    FROM public.companies
    WHERE id = v_client.company_id;

    RETURN jsonb_build_object(
        'success', true,
        'client_id', v_client.id,
        'client_name', v_client.name,
        'subject_email', v_client.email,
        'company_name', COALESCE(v_company_name, 'Simplifica CRM'),
        'purpose', 'Validación de datos y consentimiento RGPD'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_consent_request(uuid) TO anon, authenticated, service_role;
