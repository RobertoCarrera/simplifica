-- Migration to update public.process_client_consent RPC for Granular Consents
-- Adds health_data_consent and privacy_policy_consent parameters.

-- 1. First, ensure the columns exist on the clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS health_data_consent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS privacy_policy_consent boolean DEFAULT false;

-- 2. Update the RPC to accept new parameters
CREATE OR REPLACE FUNCTION public.process_client_consent(
    p_token uuid,
    p_marketing_consent boolean,
    p_health_data_consent boolean DEFAULT false, -- New
    p_privacy_policy_consent boolean DEFAULT false, -- New
    p_ip text DEFAULT NULL,
    p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client_id uuid;
    v_client_email text;
    v_client_name text;
BEGIN
    SELECT id, email, name INTO v_client_id, v_client_email, v_client_name
    FROM public.clients
    WHERE invitation_token = p_token
    LIMIT 1;

    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired token');
    END IF;

    -- Update Client Record
    UPDATE public.clients
    SET
        consent_status = 'accepted',
        marketing_consent = p_marketing_consent,
        health_data_consent = p_health_data_consent,
        privacy_policy_consent = p_privacy_policy_consent,
        consent_date = NOW(),
        consent_ip = p_ip,
        invitation_status = 'completed',
        invitation_token = NULL,
        updated_at = NOW()
    WHERE id = v_client_id;

    -- Also record strictly in gdpr_consent_records for audit trail
    -- (Best practice: keep historical record)
    
    -- Health Data
    IF p_health_data_consent THEN
        INSERT INTO public.gdpr_consent_records (
            subject_email, subject_id, consent_type, purpose, consent_given, consent_method, consent_evidence, company_id
        ) SELECT v_client_email, v_client_id, 'health_data', 'Health Data Processing', true, 'portal', 
          jsonb_build_object('token', p_token, 'ip', p_ip, 'ua', p_user_agent), company_id
        FROM public.clients WHERE id = v_client_id;
    END IF;

    -- Privacy Policy
    IF p_privacy_policy_consent THEN
        INSERT INTO public.gdpr_consent_records (
            subject_email, subject_id, consent_type, purpose, consent_given, consent_method, consent_evidence, company_id
        ) SELECT v_client_email, v_client_id, 'privacy_policy', 'General Privacy Policy', true, 'portal', 
          jsonb_build_object('token', p_token, 'ip', p_ip, 'ua', p_user_agent), company_id
        FROM public.clients WHERE id = v_client_id;
    END IF;

    -- Marketing
    IF p_marketing_consent THEN
        INSERT INTO public.gdpr_consent_records (
            subject_email, subject_id, consent_type, purpose, consent_given, consent_method, consent_evidence, company_id
        ) SELECT v_client_email, v_client_id, 'marketing', 'Marketing Communications', true, 'portal', 
          jsonb_build_object('token', p_token, 'ip', p_ip, 'ua', p_user_agent), company_id
        FROM public.clients WHERE id = v_client_id;
    END IF;


    RETURN jsonb_build_object('success', true, 'client_name', v_client_name);
END;
$$;

-- Grant access to the updated function
GRANT EXECUTE ON FUNCTION public.process_client_consent(uuid, boolean, boolean, boolean, text, text) TO anon, authenticated, service_role;
