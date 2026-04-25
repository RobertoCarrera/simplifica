-- Migration to fix Audit Logging labels for proper Stats calculation
-- 1. Updates trigger function to detect Anonymization events and log them as 'anonymization' instead of 'UPDATE'
-- 2. Ensures gdpr_export_client_data is defined and logs 'export'

-- 1. Create/Update the Trigger Function
CREATE OR REPLACE FUNCTION gdpr_audit_clients_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    audit_action TEXT;
    audit_details JSONB;
    current_user_id UUID;
    subject_email TEXT;
BEGIN
    -- Determine User ID (fallback to NEW.auth_user_id or NULL)
    current_user_id := auth.uid();
    
    -- Determine Action Type
    IF TG_OP = 'INSERT' THEN
        audit_action := 'create';
        subject_email := NEW.email;
        audit_details := jsonb_build_object('name', NEW.name, 'email', NEW.email);
    ELSIF TG_OP = 'UPDATE' THEN
        -- Check for Anonymization
        IF NEW.name = 'ANONYMIZED' AND (NEW.email LIKE 'anonymized-%' OR NEW.email IS NULL) THEN
            audit_action := 'anonymization';
            -- For anonymization, we want to preserve the OLD email in the log so we know who was anonymized
            subject_email := OLD.email; 
            audit_details := jsonb_build_object(
                'previous_name', OLD.name,
                'previous_email', OLD.email,
                'anonymized_at', NOW()
            );
        ELSE
            audit_action := 'update';
            subject_email := NEW.email;
            audit_details := jsonb_build_object(
                'changes', 
                (to_jsonb(NEW) - 'created_at' - 'updated_at' - 'metadata') - 
                (to_jsonb(OLD) - 'created_at' - 'updated_at' - 'metadata')
            );
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        audit_action := 'delete';
        subject_email := OLD.email;
        audit_details := to_jsonb(OLD);
    END IF;

    -- Insert into Audit Log
    INSERT INTO public.gdpr_audit_log (
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        old_values,
        new_values,
        user_id,
        company_id
    ) VALUES (
        audit_action,
        'clients',
        COALESCE(NEW.id, OLD.id),
        subject_email,
        CASE 
            WHEN audit_action = 'anonymization' THEN 'User Requested Anonymization / Inactivity Cleanup'
            ELSE 'Client Record Change'
        END,
        CASE WHEN TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) ELSE NULL END,
        current_user_id,
        COALESCE(NEW.company_id, OLD.company_id)
    );

    RETURN NEW;
END;
$$;

-- 2. Bind Trigger (Ensure it exists and uses this function)
DROP TRIGGER IF EXISTS gdpr_audit_clients_trigger ON public.clients;

CREATE TRIGGER gdpr_audit_clients_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION gdpr_audit_clients_changes();


-- 3. Ensure Export RPC is correct
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
    client_exists BOOLEAN;
    v_company_id UUID;
BEGIN
    SELECT EXISTS(SELECT 1 FROM public.clients WHERE email = client_email) INTO client_exists;
    
    IF NOT client_exists THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found');
    END IF;

    SELECT company_id INTO v_company_id FROM public.clients WHERE email = client_email LIMIT 1;

    -- Aggregate data (simplified for example)
    SELECT jsonb_build_object(
        'profile', to_jsonb(c),
        'exported_at', NOW()
    )
    INTO client_data
    FROM public.clients c
    WHERE c.email = client_email;

    -- Log Access
    INSERT INTO public.gdpr_audit_log (
        action_type, table_name, record_id, subject_email, purpose, old_values, user_id, company_id
    ) VALUES (
        'export',
        'clients',
        (client_data->'profile'->>'id')::UUID,
        client_email,
        'Data Portability Request',
        NULL,
        NULL,
        requesting_user_id,
        v_company_id
    );

    RETURN client_data;
END;
$$;
