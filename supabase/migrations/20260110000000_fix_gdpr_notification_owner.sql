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
    -- Get Company Name
    SELECT name INTO v_company_name
    FROM public.companies
    WHERE id = NEW.company_id;

    -- Get Company Owner ID from members
    SELECT user_id INTO v_owner_id
    FROM public.company_members
    WHERE company_id = NEW.company_id AND role = 'owner'
    LIMIT 1;

    -- If no owner found, try to find an admin or just exit
    IF v_owner_id IS NULL THEN
        -- Fallback: try to find any admin
         SELECT user_id INTO v_owner_id
         FROM public.company_members
         WHERE company_id = NEW.company_id AND role = 'admin'
         LIMIT 1;

         IF v_owner_id IS NULL THEN
            RETURN NEW;
         END IF;
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
