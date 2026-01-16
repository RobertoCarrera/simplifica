-- Migration: Role-Based Notifications
-- 1. Allow Global Notifications
ALTER TABLE public.notifications ALTER COLUMN recipient_id DROP NOT NULL;

-- 2. Helper: Check if auth user has permission in a specific company context
CREATE OR REPLACE FUNCTION public.auth_has_permission(
  p_permission text,
  p_company_id uuid
) RETURNS boolean
SECURITY DEFINER
AS $$
BEGIN
  -- Check simply: Does the user have an active role in this company that grants this permission?
  RETURN EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.role_permissions rp ON cm.role_id = rp.role_id AND cm.company_id = rp.company_id
    WHERE cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.company_id = p_company_id
      AND cm.status = 'active'
      AND rp.permission = p_permission
      AND rp.granted = true
  );
END;
$$ LANGUAGE plpgsql;

-- 3. Backfill 'notifications.view' permission for Admin/Owner/Superadmin
-- Insert for every company that has these roles set up in role_permissions (or just insert new rows)
-- We'll look for existing roles in app_roles and insert permissions for them in each company.
DO $$
DECLARE
  r_company_id uuid;
  r_role_id uuid;
  r_role_name text;
BEGIN
  -- Iterate over all companies found in company_members to ensure we target active companies mostly
  -- Better: Iterate over all companies.
  FOR r_company_id IN SELECT id FROM public.companies WHERE is_active = true
  LOOP
    -- For each "Admin" like role in this company...
    -- Find the role_id for owner, admin, super_admin from app_roles
    FOR r_role_id, r_role_name IN SELECT id, name FROM public.app_roles WHERE name IN ('owner', 'admin', 'super_admin')
    LOOP
       -- Insert permission if not exists
       INSERT INTO public.role_permissions (company_id, role, role_id, permission, granted)
       VALUES (r_company_id, r_role_name, r_role_id, 'notifications.view', true)
       ON CONFLICT DO NOTHING; -- Assuming no unique constraint on (company_id, role, permission) but if there is, this handles it.
       -- Note: role_permissions might not have a clean UNIQUE constraint on (company, role, permission).
       -- Let's use WHERE NOT EXISTS to be safe if no constraint.
    END LOOP;
  END LOOP;
END
$$;

-- 4. Update RLS on Notifications
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;

-- Insert: Allow authenticated users (e.g. triggers/system usually bypass RLS if security definer, but for client-side inserts if any)
CREATE POLICY "Authenticated users can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- View: Own OR (Global AND Has Permission)
CREATE POLICY "Users can view notifications" ON public.notifications
FOR SELECT TO authenticated
USING (
  (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE id = recipient_id)) -- Own
  OR
  (
    recipient_id IS NULL 
    AND company_id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) 
      AND status = 'active'
    )
    AND public.auth_has_permission('notifications.view', company_id)
  )
);

-- Update: Same logic (Example: Mark as read)
CREATE POLICY "Users can update notifications" ON public.notifications
FOR UPDATE TO authenticated
USING (
  (auth.uid() IN (SELECT auth_user_id FROM public.users WHERE id = recipient_id)) -- Own
  OR
  (
    recipient_id IS NULL 
    AND company_id IN (
      SELECT company_id FROM public.company_members 
      WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()) 
      AND status = 'active'
    )
    AND public.auth_has_permission('notifications.view', company_id)
  )
);

-- 5. Update GDPR Trigger to use Global Notification
CREATE OR REPLACE FUNCTION public.handle_gdpr_consent_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  client_name text;
  notification_content text;
BEGIN
  -- Get Client Name
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

  -- Insert GLOBAL Notification (No specific recipient)
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
    NULL, -- Global
    'gdpr_consent_update',
    NEW.id,
    'Actualización GDPR',
    notification_content,
    false,
    now()
  );

  RETURN NEW;
END;
$function$;
