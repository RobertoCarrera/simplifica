-- 20260423000000_restore_security_policies.sql
-- RESTORE CRITICAL SECURITY POLICIES (AUDIT REMEDIATION)
-- Fixes missing RLS on sensitive and multi-tenant tables.

-- 1. VeriFactu Settings (Sensitive: Contains Private Keys)
-- Only Owners and Admins should access or modify this configuration.
ALTER TABLE IF EXISTS "public"."verifactu_settings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "verifactu_settings_admin_isolation" ON "public"."verifactu_settings";
CREATE POLICY "verifactu_settings_admin_isolation" ON "public"."verifactu_settings"
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = verifactu_settings.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = verifactu_settings.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);

-- 2. Payment Integrations (Sensitive: Contains API Keys/Secrets)
-- Only Owners and Admins should access or modify.
ALTER TABLE IF EXISTS "public"."payment_integrations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_integrations_admin_isolation" ON "public"."payment_integrations";
CREATE POLICY "payment_integrations_admin_isolation" ON "public"."payment_integrations"
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = payment_integrations.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = payment_integrations.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);

-- 3. Products (Business Data)
-- All active company members can READ.
-- Only Owners/Admins can WRITE (Insert/Update/Delete).

ALTER TABLE IF EXISTS "public"."products" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_members" ON "public"."products";
CREATE POLICY "products_select_members" ON "public"."products"
FOR SELECT TO authenticated
USING (
  company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND status = 'active'
  )
);

DROP POLICY IF EXISTS "products_write_admin" ON "public"."products";
CREATE POLICY "products_write_admin" ON "public"."products"
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = products.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "products_update_admin" ON "public"."products";
CREATE POLICY "products_update_admin" ON "public"."products"
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = products.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = products.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);

DROP POLICY IF EXISTS "products_delete_admin" ON "public"."products";
CREATE POLICY "products_delete_admin" ON "public"."products"
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = products.company_id
      AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin')
  )
);
