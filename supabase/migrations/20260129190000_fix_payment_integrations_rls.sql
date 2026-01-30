-- 20260129190000_fix_payment_integrations_rls.sql

-- SECURITY FIX: PAYMENT INTEGRATIONS DATA LEAK & VERIFACTU SETTINGS HARDENING
-- Risk: Critical (Cross-Tenant Data Access)
-- Description: Previous policies for payment_integrations lacked company_id filtering,
-- allowing any admin to view all integrations. This migration adds stricter RLS.

-- 1. Fix payment_integrations Policies
-- Drop existing insecure policies (using 'TO public' and missing company_id check)
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Create new policies TO authenticated with company_id check
CREATE POLICY "payment_integrations_select_policy" ON public.payment_integrations
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_insert_policy" ON public.payment_integrations
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_update_policy" ON public.payment_integrations
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
      AND u.deleted_at IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
      AND u.deleted_at IS NULL
  )
);

CREATE POLICY "payment_integrations_delete_policy" ON public.payment_integrations
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('owner', 'admin', 'super_admin')
      AND u.company_id = payment_integrations.company_id
      AND u.deleted_at IS NULL
  )
);

-- 2. Harden verifactu_settings Policies
-- Move from TO public -> TO authenticated
DROP POLICY IF EXISTS "verifactu_settings_select_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_insert_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_update_policy" ON public.verifactu_settings;
DROP POLICY IF EXISTS "verifactu_settings_delete_policy" ON public.verifactu_settings;

CREATE POLICY "verifactu_settings_select_policy" ON public.verifactu_settings
FOR SELECT TO authenticated
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

CREATE POLICY "verifactu_settings_insert_policy" ON public.verifactu_settings
FOR INSERT TO authenticated
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

CREATE POLICY "verifactu_settings_update_policy" ON public.verifactu_settings
FOR UPDATE TO authenticated
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

CREATE POLICY "verifactu_settings_delete_policy" ON public.verifactu_settings
FOR DELETE TO authenticated
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
