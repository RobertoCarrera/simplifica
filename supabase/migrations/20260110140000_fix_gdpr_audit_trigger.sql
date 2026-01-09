CREATE OR REPLACE FUNCTION gdpr_audit_clients_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    audit_action TEXT;
    current_user_id UUID;
    subject_email TEXT;
BEGIN
    -- Determine User ID (fallback to NEW.auth_user_id or NULL)
    current_user_id := auth.uid();
    
    -- Determine Action Type
    IF TG_OP = 'INSERT' THEN
        audit_action := 'create';
        subject_email := NEW.email;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Check for Anonymization
        IF NEW.name = 'ANONYMIZED' AND (NEW.email LIKE 'anonymized-%' OR NEW.email IS NULL) THEN
            audit_action := 'anonymization';
            -- For anonymization, we want to preserve the OLD email in the log so we know who was anonymized
            subject_email := OLD.email; 
        ELSE
            audit_action := 'update';
            subject_email := NEW.email;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        audit_action := 'delete';
        subject_email := OLD.email;
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
