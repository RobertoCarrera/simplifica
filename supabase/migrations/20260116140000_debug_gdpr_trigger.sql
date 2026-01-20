-- Instrument GDPR Trigger with Debug Logging
CREATE OR REPLACE FUNCTION public.handle_gdpr_consent_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  client_name text;
  admin_user RECORD;
  notification_content text;
  admin_count int := 0;
BEGIN
  INSERT INTO public.debug_logs (message) VALUES ('Trigger Started: ID=' || NEW.id || ' Company=' || NEW.company_id);

  -- Get Client Name
  SELECT COALESCE(name, '') || ' ' || COALESCE(apellidos, '') INTO client_name
  FROM public.clients
  WHERE id = NEW.subject_id;

  IF client_name IS NULL OR TRIM(client_name) = '' THEN
    client_name := NEW.subject_email;
  END IF;
  
  INSERT INTO public.debug_logs (message) VALUES ('Client Name resolved: ' || client_name);

  -- Determine Message
  IF NEW.consent_given THEN
    notification_content := 'El cliente ' || client_name || ' ha aceptado el consentimiento de ' || NEW.purpose;
  ELSE
    notification_content := 'El cliente ' || client_name || ' ha revocado el consentimiento de ' || NEW.purpose;
  END IF;

  -- Find Company Admins/Owners
  FOR admin_user IN 
    SELECT u.id, ar.name as role_name 
    FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.company_id = NEW.company_id 
      AND (ar.name IN ('owner', 'admin', 'superadmin') OR u.is_dpo = true)
      AND u.deleted_at IS NULL
      AND u.active = true
  LOOP
    admin_count := admin_count + 1;
    INSERT INTO public.debug_logs (message) VALUES ('Found Admin: ' || admin_user.id || ' Role: ' || COALESCE(admin_user.role_name, 'None'));

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
      admin_user.id,
      'gdpr_consent_update',
      NEW.id,
      'Actualización GDPR',
      notification_content,
      false,
      now()
    );
  END LOOP;

  INSERT INTO public.debug_logs (message) VALUES ('Trigger Finished. Admins notified: ' || admin_count);

  RETURN NEW;
END;
$function$;
