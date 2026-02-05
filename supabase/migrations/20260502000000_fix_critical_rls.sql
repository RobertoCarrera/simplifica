-- Migration: Fix Critical RLS Leaks (Audit 2026-05)
-- Priority: CRITICAL
-- Fixes cross-tenant data leaks in payment_integrations, domains, and scheduled_jobs.

-- 1. Payment Integrations
-- Previous policies allowed any admin to see ALL integrations.
-- New policies enforce company_id match.

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO public
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

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
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

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
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

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
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


-- 2. Domains
-- Previous policy "Admins can manage all domains" was global.
-- New policy restricts management to domains assigned to users in the SAME company.

DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.domains;
DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;

-- Allow viewing own domains OR verified domains belonging to my company (if I am admin)
CREATE POLICY "view_domains" ON public.domains FOR SELECT TO authenticated
USING (
  (assigned_to_user = auth.uid()) OR
  (
    is_verified = true AND EXISTS (
        SELECT 1 FROM public.users u
        LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
        WHERE u.auth_user_id = auth.uid()
        AND ar.name IN ('admin', 'owner', 'super_admin')
        AND u.deleted_at IS NULL
        AND u.company_id = (
            SELECT owner.company_id FROM public.users owner
            WHERE owner.auth_user_id = domains.assigned_to_user
        )
    )
  )
);

-- Allow admins to manage domains of their company
CREATE POLICY "manage_company_domains" ON public.domains FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
    AND ar.name IN ('admin', 'owner', 'super_admin')
    AND u.deleted_at IS NULL
    AND u.company_id = (
        SELECT owner.company_id FROM public.users owner
        WHERE owner.auth_user_id = domains.assigned_to_user
    )
  )
);


-- 3. Scheduled Jobs
-- Restrict to service_role only. No public access.

DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;
-- No replacement policy needed for public/authenticated, as default is deny.
-- service_role has access by default (bypass RLS).
