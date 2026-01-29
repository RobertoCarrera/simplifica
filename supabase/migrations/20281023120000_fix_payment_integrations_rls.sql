-- Fix RLS for payment_integrations (Cross-tenant leak)
-- Description: Updates RLS policies to strictly enforce company_id check via company_members table.

-- Drop existing insecure policies
DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Create new secure policies
-- Logic: User -> public.users (via auth_user_id) -> company_members -> Check Role & Company Match

CREATE POLICY "payment_integrations_select" ON public.payment_integrations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = payment_integrations.company_id
      AND cm.role IN ('owner', 'admin')
      AND cm.status = 'active'
  )
);
