-- Fix Critical RLS Leaks in payment_integrations, domains, and scheduled_jobs

-- 1. Scheduled Jobs: Restrict to service_role only
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;
-- No new policy for authenticated/public implies DENY. service_role bypasses RLS.

-- 2. Payment Integrations: Enforce company_id check
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND u.company_id = payment_integrations.company_id
    AND ar.name IN ('owner', 'admin', 'super_admin')
    AND u.deleted_at IS NULL
  )
);

-- 3. Domains: Enforce company match via assigned_to_user
DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.domains;
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;

CREATE POLICY "Authenticated users can view verified domains" ON public.domains FOR SELECT TO authenticated
USING (
  (assigned_to_user = auth.uid()) OR
  (
    is_verified = true AND EXISTS (
        SELECT 1 FROM public.users u_admin
        LEFT JOIN public.app_roles ar ON u_admin.app_role_id = ar.id
        JOIN public.users u_target ON domains.assigned_to_user = u_target.auth_user_id
        WHERE u_admin.auth_user_id = auth.uid()
        AND u_admin.company_id = u_target.company_id
        AND ar.name IN ('admin', 'owner', 'super_admin')
        AND u_admin.deleted_at IS NULL
    )
  )
);

CREATE POLICY "Admins can manage all domains" ON public.domains FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u_admin
    LEFT JOIN public.app_roles ar ON u_admin.app_role_id = ar.id
    JOIN public.users u_target ON domains.assigned_to_user = u_target.auth_user_id
    WHERE u_admin.auth_user_id = auth.uid()
    AND u_admin.company_id = u_target.company_id
    AND ar.name IN ('admin', 'owner', 'super_admin')
    AND u_admin.deleted_at IS NULL
  )
);
