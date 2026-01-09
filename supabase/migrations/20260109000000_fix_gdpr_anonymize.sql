-- Migration to fix/overwrite gdpr_anonymize_client function
-- This ensures the function correctly anonymizes data in the 'clients' table
-- and handles logging securely.

CREATE OR REPLACE FUNCTION gdpr_anonymize_client(
    client_id UUID,
    requesting_user_id UUID,
    anonymization_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    affected_client_name TEXT;
    affected_client_email TEXT;
BEGIN
    -- 1. Fetch current data for audit
    SELECT name, email INTO affected_client_name, affected_client_email
    FROM public.clients
    WHERE id = client_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found');
    END IF;

    -- 2. Update the client record
    -- We use 'anonymized-{id}@deleted.com' to maintain unique constraint if exists on email
    UPDATE public.clients
    SET
        name = 'ANONYMIZED',
        apellidos = NULL,
        email = 'anonymized-' || client_id || '@deleted.com',
        phone = NULL,
        dni = NULL,
        nif = NULL, -- Some legacy rows might use this
        address = NULL, -- Clear json/text address
        direccion_id = NULL, -- Clear FK to address table
        metadata = jsonb_build_object('anonymized', true, 'original_deleted_at', NOW()),
        updated_at = NOW(),
        
        -- Business fields
        business_name = 'ANONYMIZED',
        cif_nif = NULL,
        trade_name = NULL,
        legal_representative_name = NULL,
        legal_representative_dni = NULL,
        mercantile_registry_data = '{}'::jsonb,
        
        -- GDPR specific fields
        marketing_consent = false,
        marketing_consent_date = NULL,
        data_processing_consent = false,
        deletion_requested_at = NOW(),
        deletion_reason = anonymization_reason,
        anonymized_at = NOW(),
        
        -- Security/Access
        auth_user_id = NULL, -- Remove portal access
        is_active = false,
        deleted_at = NOW() -- Soft delete mark as well to hide from main lists
    WHERE id = client_id;

    -- 3. Log to audit (if table exists)
    BEGIN
        INSERT INTO public.gdpr_audit_log (
            action_type, table_name, record_id, subject_email, purpose, old_values, user_id
        ) VALUES (
            'anonymization',
            'clients',
            client_id,
            affected_client_email,
            anonymization_reason,
            jsonb_build_object('name', affected_client_name, 'email', affected_client_email),
            requesting_user_id
        );
    EXCEPTION WHEN undefined_table THEN
        -- If logging table missing, ignore
        NULL;
    END;

    RETURN jsonb_build_object('success', true);
END;
$$;
