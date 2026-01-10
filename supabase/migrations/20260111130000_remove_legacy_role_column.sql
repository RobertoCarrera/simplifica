-- Migration to remove legacy 'role' column and refactor dependencies to use 'app_roles' table

-- 1. Drop dependent views and policies (CASCADE will handle some, but explicit drops are safer for policies)
DROP VIEW IF EXISTS public.admin_company_analysis CASCADE;
DROP VIEW IF EXISTS public.admin_pending_users CASCADE;
DROP VIEW IF EXISTS public.users_with_company CASCADE; -- Depends on user_company_context
DROP VIEW IF EXISTS public.user_company_context CASCADE;
DROP VIEW IF EXISTS public.profiles CASCADE;
DROP VIEW IF EXISTS public.valid_users_view CASCADE;

-- Drop Policies relying on 'role' column
DROP POLICY IF EXISTS "app_settings_write" ON public.app_settings;
DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;

-- Verifactu Settings Policies
DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_insert_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_delete_policy" ON public.verifactu_settings;

-- Verifactu Cert History
DROP POLICY IF EXISTS "verifactu_cert_history_select_policy" ON public.verifactu_cert_history;

-- Payment Integrations Policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Client Variant Assignments
DROP POLICY IF EXISTS "Admins can manage assignments" ON public.client_variant_assignments;

-- Domains
DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.domains;
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;


-- 2. RECREATE VIEWS with new logic (joining app_roles)

-- View: user_company_context
CREATE OR REPLACE VIEW public.user_company_context AS
 SELECT auth.uid() AS auth_user_id,
    u.company_id,
    ar.name AS role
   FROM public.users u
   LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
  WHERE u.auth_user_id = auth.uid();

-- View: users_with_company (Recreated as it depended on user_company_context)
CREATE OR REPLACE VIEW public.users_with_company AS
 SELECT u.id,
    u.email,
    u.name,
    u.surname,
    u.permissions,
    u.created_at AS user_created_at,
    c.id AS company_id,
    c.name AS company_name,
    c.website AS company_website,
    c.legacy_negocio_id
   FROM public.users u
     JOIN public.companies c ON u.company_id = c.id
  WHERE u.deleted_at IS NULL 
    AND c.deleted_at IS NULL 
    AND u.company_id IN ( SELECT user_company_context.company_id FROM public.user_company_context);

-- View: admin_pending_users
CREATE OR REPLACE VIEW public.admin_pending_users AS
 SELECT p.id,
    p.email,
    p.full_name,
    p.company_name,
    p.created_at,
    p.expires_at,
    p.confirmed_at,
        CASE
            WHEN p.confirmed_at IS NOT NULL THEN 'confirmed'::text
            WHEN p.expires_at < now() THEN 'expired'::text
            ELSE 'pending'::text
        END AS status
   FROM public.pending_users p
  WHERE (EXISTS ( 
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() 
    AND ar.name IN ('owner', 'admin', 'super_admin') 
    AND u.active = true
  ))
  ORDER BY p.created_at DESC;

-- View: admin_company_analysis
CREATE OR REPLACE VIEW public.admin_company_analysis AS
 SELECT c.id,
    c.name,
    c.slug,
    c.created_at,
    count(u.id) AS total_users,
    count(u.id) FILTER (WHERE ar.name = 'owner') AS owners_count,
    count(u.id) FILTER (WHERE ar.name = 'admin') AS admins_count,
    count(u.id) FILTER (WHERE ar.name = 'member') AS members_count,
    count(ci.id) FILTER (WHERE ci.status = 'pending') AS pending_invitations,
    string_agg(u.email, ', ') FILTER (WHERE ar.name = 'owner') AS owner_emails
   FROM public.companies c
     LEFT JOIN public.users u ON c.id = u.company_id AND u.active = true
     LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
     LEFT JOIN public.company_invitations ci ON c.id = ci.company_id AND ci.status = 'pending'
  WHERE c.deleted_at IS NULL
  GROUP BY c.id, c.name, c.slug, c.created_at
  ORDER BY c.created_at DESC;

-- View: profiles
CREATE OR REPLACE VIEW public.profiles AS
 SELECT u.auth_user_id AS user_id,
    u.company_id,
    ar.name AS role,
    u.last_session_at
   FROM public.users u
   LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
  WHERE u.deleted_at IS NULL;

-- View: valid_users_view
CREATE OR REPLACE VIEW public.valid_users_view AS
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


-- 3. RECREATE POLICIES with new logic

-- App Settings (Uses ID)
CREATE POLICY "app_settings_write" ON public.app_settings
FOR ALL TO public
USING (
  (auth.role() = 'service_role'::text) OR 
  (EXISTS (
    SELECT 1 FROM public.users u 
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.id = auth.uid() AND ar.name IN ('admin', 'owner', 'super_admin')
  ))
)
WITH CHECK (
  (auth.role() = 'service_role'::text) OR 
  (EXISTS (
    SELECT 1 FROM public.users u 
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.id = auth.uid() AND ar.name IN ('admin', 'owner', 'super_admin')
  ))
);

-- Scheduled Jobs (Uses auth_user_id, assumed from typical usage or user context)
-- Original didn't specify, but let's assume auth_user_id as standard for many.
-- Wait, I don't have the original scheduled_jobs definition.
-- Let's use auth_user_id to be safe as it's the standard for auth.uid() link usually.
CREATE POLICY "scheduled_jobs_read" ON public.scheduled_jobs
FOR SELECT TO public
USING (
  (EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name IN ('admin', 'owner', 'super_admin')
  ))
);

-- Verifactu Settings (Uses auth_user_id)
CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() 
      AND u.company_id = verifactu_settings.company_id 
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "verifactu_settings_insert_policy" ON public.verifactu_settings FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() 
      AND u.company_id = verifactu_settings.company_id 
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() 
      AND u.company_id = verifactu_settings.company_id 
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() 
      AND u.company_id = verifactu_settings.company_id 
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "verifactu_settings_delete_policy" ON public.verifactu_settings FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() 
      AND u.company_id = verifactu_settings.company_id 
      AND ar.name = 'owner' 
      AND u.deleted_at IS NULL
  )
);

-- Verifactu Cert History (Uses auth_user_id)
CREATE POLICY "verifactu_cert_history_select_policy" ON public.verifactu_cert_history FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() 
      AND u.company_id = verifactu_cert_history.company_id 
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

-- Payment Integrations (Uses auth_user_id)
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name IN ('owner', 'admin', 'super_admin')
  )
);

-- Client Variant Assignments (Uses ID)
CREATE POLICY "Admins can manage assignments" ON public.client_variant_assignments FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.id = auth.uid() AND ar.name IN ('admin', 'super_admin')
  )
);

-- Domains (Uses auth_user_id)
CREATE POLICY "Authenticated users can view verified domains" ON public.domains FOR SELECT TO authenticated
USING (
  (assigned_to_user = auth.uid()) OR 
  (
    is_verified = true AND EXISTS (
        SELECT 1 FROM public.users u
        LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
        WHERE u.auth_user_id = auth.uid() AND ar.name IN ('admin', 'owner', 'super_admin')
    )
  )
);

CREATE POLICY "Admins can manage all domains" ON public.domains FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid() AND ar.name IN ('admin', 'owner', 'super_admin')
  )
);

-- 4. FINALLY DROP THE COLUMN
ALTER TABLE public.users DROP COLUMN role;
