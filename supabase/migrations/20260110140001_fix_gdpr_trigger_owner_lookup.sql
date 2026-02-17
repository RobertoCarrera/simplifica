-- Fix GDPR Notification Trigger to correctly identify Company Owner
-- Previous version assumed 'owner_id' column existed on 'companies' table.
-- Correct approach: Look up 'owner' role in 'company_members' table.

CREATE OR REPLACE FUNCTION notify_owner_on_gdpr_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_owner_id UUID;
    v_subject_name TEXT;
BEGIN
    -- Get Company Owner ID from company_members
    SELECT user_id INTO v_owner_id
    FROM public.company_members
    WHERE company_id = NEW.company_id
    AND role = 'owner'
    LIMIT 1;

    -- Fallback: If no owner found, try 'admin'
    IF v_owner_id IS NULL THEN
        SELECT user_id INTO v_owner_id
        FROM public.company_members
        WHERE company_id = NEW.company_id
        AND role = 'admin'
        LIMIT 1;
    END IF;

    -- If still no recipient, exit (prevent error)
    IF v_owner_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Determine subject name for display
    v_subject_name := COALESCE(NEW.subject_name, NEW.subject_email, 'Usuario');

    -- Insert Notification
    INSERT INTO public.notifications (
        company_id,
        recipient_id,
        type,
        reference_id,
        title,
        content,
        is_read,
        created_at
    ) VALUES (
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
