-- Migration to update GDPR Client Data Export (Article 20)
-- Includes:
-- 1. Profile Data
-- 2. DECIPHERED Clinical Notes (Art. 9)
-- 3. Consent History
-- 4. Access Requests

CREATE OR REPLACE FUNCTION gdpr_export_client_data(
    client_email TEXT,
    requesting_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    client_data JSONB;
    client_record RECORD;
    v_company_id UUID;
    v_encryption_key text := 'simplifica-secure-key-2026'; -- Matching key from secure_clinical_notes.sql
BEGIN
    SELECT * INTO client_record FROM public.clients WHERE email = client_email LIMIT 1;
    
    IF client_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found');
    END IF;

    v_company_id := client_record.company_id;

    -- Aggregate data
    SELECT jsonb_build_object(
        'profile', to_jsonb(client_record),
        'clinical_notes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', n.id,
                'content', pgp_sym_decrypt(n.content::bytea, v_encryption_key),
                'created_at', n.created_at,
                'created_by', n.created_by
            ))
            FROM public.client_clinical_notes n
            WHERE n.client_id = client_record.id
        ), '[]'::jsonb),
        'consents', COALESCE((
            SELECT jsonb_agg(to_jsonb(cr))
            FROM public.gdpr_consent_records cr
            WHERE cr.subject_email = client_email
        ), '[]'::jsonb),
        'access_requests', COALESCE((
            SELECT jsonb_agg(to_jsonb(ar))
            FROM public.gdpr_access_requests ar
            WHERE ar.subject_email = client_email
        ), '[]'::jsonb),
        'exported_at', NOW()
    )
    INTO client_data;

    -- Log Access
    INSERT INTO public.gdpr_audit_log (
        action_type, table_name, record_id, subject_email, purpose, old_values, user_id, company_id
    ) VALUES (
        'export',
        'clients',
        client_record.id,
        client_email,
        'Data Portability Request (Full Export)',
        NULL,
        NULL,
        requesting_user_id,
        v_company_id
    );

    RETURN client_data;
END;
$$;
