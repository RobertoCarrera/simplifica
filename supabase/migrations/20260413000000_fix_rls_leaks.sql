-- Migration: Fix RLS Leaks (Domains, Scheduled Jobs, Verifactu)
-- Date: 2026-04-13
-- Description: Fixes critical cross-tenant data leaks and insecure policies.

-- 1. FIX DOMAINS RLS (Cross-Tenant Leak)
-- Previous policy allowed any admin to manage ALL domains globally.
-- New policy restricts access to admins of the SAME company as the domain owner.

DROP POLICY IF EXISTS "Admins can manage all domains" ON public.domains;

CREATE POLICY "Admins can manage all domains"
ON public.domains FOR ALL
TO authenticated
USING (
  EXISTS (
      SELECT 1
      FROM public.users admin_user
      JOIN public.app_roles ar ON admin_user.app_role_id = ar.id
      -- Join to find the company of the domain owner
      JOIN public.users owner_user ON owner_user.auth_user_id = domains.assigned_to_user
      WHERE admin_user.auth_user_id = auth.uid()
      AND ar.name IN ('admin', 'owner', 'super_admin')
      -- Critical: Ensure Admin and Domain Owner are in the same company
      AND admin_user.company_id = owner_user.company_id
      AND admin_user.active = true
      AND admin_user.deleted_at IS NULL
  )
);


-- 2. FIX SCHEDULED JOBS RLS & SCHEMA
-- Add company_id to scheduled_jobs to enable filtering.

ALTER TABLE public.scheduled_jobs
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id);

-- Drop insecure global policy
DROP POLICY IF EXISTS "scheduled_jobs_read" ON public.scheduled_jobs;

-- Create secure policy filtered by company_id
CREATE POLICY "scheduled_jobs_read" ON public.scheduled_jobs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = scheduled_jobs.company_id -- Critical Filter
      AND ar.name IN ('admin', 'owner', 'super_admin')
      AND u.deleted_at IS NULL
  )
);

-- Note: We also create a write policy for completeness if needed, but the finding was about READ.
-- Assuming inserts are done by service role mostly, but if users insert, they need policy.
-- For now, we only fix the reported READ leak.


-- 3. FIX VERIFACTU SETTINGS (Remove TO public)
-- Change policies to TO authenticated.

DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_insert_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_delete_policy" ON public.verifactu_settings;

CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings FOR SELECT TO authenticated
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

CREATE POLICY "verifactu_settings_insert_policy" ON public.verifactu_settings FOR INSERT TO authenticated
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

CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings FOR UPDATE TO authenticated
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

CREATE POLICY "verifactu_settings_delete_policy" ON public.verifactu_settings FOR DELETE TO authenticated
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

-- 4. FIX VERIFACTU CERT HISTORY (Remove TO public)

DROP POLICY IF EXISTS "verifactu_cert_history_select_policy" ON public.verifactu_cert_history;

CREATE POLICY "verifactu_cert_history_select_policy" ON public.verifactu_cert_history FOR SELECT TO authenticated
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
