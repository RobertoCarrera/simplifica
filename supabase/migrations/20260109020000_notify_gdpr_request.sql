-- Trigger to notify Company Owner when a new GDPR Access Request is created

CREATE OR REPLACE FUNCTION notify_owner_on_gdpr_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_owner_id UUID;
    v_company_name TEXT;
    v_subject_name TEXT;
BEGIN
    -- Get Company Owner ID and Name
    SELECT owner_id, name INTO v_owner_id, v_company_name
    FROM public.companies
    WHERE id = NEW.company_id;

    -- If no owner found (shouldn't happen), exit
    IF v_owner_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Determine subject name for display
    v_subject_name := COALESCE(NEW.subject_name, NEW.subject_email, 'Usuario');

    -- Insert Notification
    INSERT INTO public.notifications (
        id,
        company_id,
        recipient_id,
        type,
        reference_id,
        title,
        content,
        is_read,
        created_at
    ) VALUES (
        gen_random_uuid(),
        NEW.company_id,
        v_owner_id,
        'gdpr_request',
        NEW.id,
        'Nueva Solicitud GDPR: ' || NEW.request_type,
        'El usuario ' || v_subject_name || ' ha solicitado: ' || NEW.request_type || '.',
        false,
        NOW()
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_gdpr_request_created ON public.gdpr_access_requests;

CREATE TRIGGER on_gdpr_request_created
    AFTER INSERT ON public.gdpr_access_requests
    FOR EACH ROW
    EXECUTE FUNCTION notify_owner_on_gdpr_request();
