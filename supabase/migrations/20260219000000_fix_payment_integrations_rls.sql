-- Fix Critical RLS Leak in payment_integrations
-- Previous policies allowed any admin to view ALL payment integrations across all companies.
-- New policies restrict access to only admins/owners of the specific company.

DROP POLICY IF EXISTS "payment_integrations_select" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON public.payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON public.payment_integrations;

-- Use current_user_is_admin(company_id) which checks company_members table safely
CREATE POLICY "payment_integrations_select" ON public.payment_integrations
FOR SELECT TO public
USING (
  public.current_user_is_admin(company_id)
);

CREATE POLICY "payment_integrations_insert" ON public.payment_integrations
FOR INSERT TO public
WITH CHECK (
  public.current_user_is_admin(company_id)
);

CREATE POLICY "payment_integrations_update" ON public.payment_integrations
FOR UPDATE TO public
USING (
  public.current_user_is_admin(company_id)
)
WITH CHECK (
  public.current_user_is_admin(company_id)
);

CREATE POLICY "payment_integrations_delete" ON public.payment_integrations
FOR DELETE TO public
USING (
  public.current_user_is_admin(company_id)
);
