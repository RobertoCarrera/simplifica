-- Trigger to notify Company Owner when a new GDPR Access Request is created (SPANISH TRANSLATION)

CREATE OR REPLACE FUNCTION notify_owner_on_gdpr_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_owner_id UUID;
    v_company_name TEXT;
    v_subject_name TEXT;
    v_request_type_es TEXT;
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

    -- Translate request type
    CASE NEW.request_type
        WHEN 'access' THEN v_request_type_es := 'Acceso a Datos';
        WHEN 'rectification' THEN v_request_type_es := 'Rectificación';
        WHEN 'erasure' THEN v_request_type_es := 'Supresión (Derecho al Olvido)';
        WHEN 'portability' THEN v_request_type_es := 'Portabilidad';
        WHEN 'restriction' THEN v_request_type_es := 'Limitación del Tratamiento';
        WHEN 'objection' THEN v_request_type_es := 'Oposición';
        ELSE v_request_type_es := NEW.request_type;
    END CASE;

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
        'Nueva Solicitud RGPD: ' || v_request_type_es,
        'El usuario ' || v_subject_name || ' ha solicitado: ' || v_request_type_es || '.',
        false,
        NOW()
    );

    RETURN NEW;
END;
$$;
