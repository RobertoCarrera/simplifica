-- 1. Fix valid_users_view security by enforcing security_invoker
-- This ensures that RLS policies on underlying tables (like public.users) are respected
-- preventing 'anon' from bypassing checks if the view was SECURITY DEFINER/Owner privileges.
DROP VIEW IF EXISTS public.valid_users_view CASCADE;

CREATE OR REPLACE VIEW public.valid_users_view WITH (security_invoker = true) AS
 SELECT p.id,
    p.company_id,
    p.email,
    p.name,
    ar.name AS role,
    p.active,
    p.created_at,
    p.updated_at,
    p.deleted_at,
    p.permissions,
    p.auth_user_id,
    p.is_dpo,
    p.gdpr_training_completed,
    p.gdpr_training_date,
    p.data_access_level,
    p.last_privacy_policy_accepted,
    p.failed_login_attempts,
    p.account_locked_until,
    p.surname,
    p.last_session_at,
    (a.id IS NOT NULL) AS has_auth
   FROM public.users p
     LEFT JOIN auth.users a ON p.id = a.id
     LEFT JOIN public.app_roles ar ON p.app_role_id = ar.id;

-- 2. Add RLS to hidden_units
ALTER TABLE public.hidden_units ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view hidden units (likely needed for booking logic)
CREATE POLICY "Authenticated users can select hidden_units"
ON public.hidden_units FOR SELECT TO authenticated
USING (true);

-- Allow Admins/Owners to manage hidden units
CREATE POLICY "Admins can manage hidden_units"
ON public.hidden_units FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() 
      AND ar.name IN ('admin', 'owner', 'super_admin')
  )
);

-- 3. Add RLS to scheduled_notifications
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;

-- Allow Admin/System to manage all. 
-- Assuming standard user usage, but to be safe we'll give full access to Admins/Owners.
CREATE POLICY "Admins can manage scheduled_notifications"
ON public.scheduled_notifications FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() 
      AND ar.name IN ('admin', 'owner', 'super_admin')
  )
);

-- 4. Fix Permissive ticket_comments Update Policy
-- The issue is likely 'WITH CHECK (true)' allowing users to update columns they shouldn't (like ownership).
DROP POLICY IF EXISTS "Staff can update own comments" ON public.ticket_comments;

CREATE POLICY "Staff can update own comments" ON public.ticket_comments
FOR UPDATE TO public
USING (
  (user_id = auth.uid()) OR 
  ((user_id IS NULL) AND (EXISTS ( 
      SELECT 1 FROM users 
      WHERE users.auth_user_id = auth.uid() AND users.company_id = ticket_comments.company_id
  )))
)
WITH CHECK (
  -- Ensure they can't change the author (user_id) or move it to another company
  (
    (user_id = auth.uid()) OR 
    ((user_id IS NULL) AND (EXISTS ( 
        SELECT 1 FROM users 
        WHERE users.auth_user_id = auth.uid() AND users.company_id = ticket_comments.company_id
    )))
  )
);
