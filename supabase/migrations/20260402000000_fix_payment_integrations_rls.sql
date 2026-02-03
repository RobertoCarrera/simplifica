-- Migration: Fix Critical RLS in payment_integrations
-- Description: Fixes a cross-tenant data leak where admins could view/edit payment integrations of other companies.
-- Enforces strictly that 'owner' and 'admin' can only access integrations where company_id matches their user profile company_id.

-- 1. Drop insecure policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- 2. Create secured policies

-- SELECT
CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND (
          ar.name = 'super_admin'
          OR (ar.name IN ('owner', 'admin') AND u.company_id = payment_integrations.company_id)
      )
  )
);

-- INSERT
CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND (
          ar.name = 'super_admin'
          OR (ar.name IN ('owner', 'admin') AND u.company_id = payment_integrations.company_id)
      )
  )
);

-- UPDATE
CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND (
          ar.name = 'super_admin'
          OR (ar.name IN ('owner', 'admin') AND u.company_id = payment_integrations.company_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND (
          ar.name = 'super_admin'
          OR (ar.name IN ('owner', 'admin') AND u.company_id = payment_integrations.company_id)
      )
  )
);

-- DELETE
CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND (
          ar.name = 'super_admin'
          OR (ar.name IN ('owner', 'admin') AND u.company_id = payment_integrations.company_id)
      )
  )
);
