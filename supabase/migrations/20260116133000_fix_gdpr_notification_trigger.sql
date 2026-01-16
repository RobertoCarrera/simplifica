-- Fix GDPR Notification Trigger to use app_roles join
-- public.users does not have 'role' column (it was removed/migrated to app_role_id).

CREATE OR REPLACE FUNCTION public.handle_gdpr_consent_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  client_name text;
  admin_user RECORD;
  notification_content text;
BEGIN
  -- Get Client Name
  -- Use coalesce to handle null names gracefully
  SELECT COALESCE(name, '') || ' ' || COALESCE(apellidos, '') INTO client_name
  FROM public.clients
  WHERE id = NEW.subject_id;

  IF client_name IS NULL OR TRIM(client_name) = '' THEN
    client_name := NEW.subject_email;
  END IF;

  -- Determine Message
  IF NEW.consent_given THEN
    notification_content := 'El cliente ' || client_name || ' ha aceptado el consentimiento de ' || NEW.purpose;
  ELSE
    notification_content := 'El cliente ' || client_name || ' ha revocado el consentimiento de ' || NEW.purpose;
  END IF;

  -- Find Company Admins/Owners
  -- FIXED: Join with app_roles to check role name, or check is_dpo column on users.
  FOR admin_user IN 
    SELECT u.id 
    FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.company_id = NEW.company_id 
      AND (ar.name IN ('owner', 'admin', 'superadmin') OR u.is_dpo = true)
      AND u.deleted_at IS NULL -- Important: don't notify deleted users
      AND u.active = true      -- Only active users
  LOOP
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

  RETURN NEW;
END;
$function$;
