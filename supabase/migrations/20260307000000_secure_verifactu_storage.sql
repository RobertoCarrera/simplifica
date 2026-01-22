-- Secure VeriFactu Storage
-- Enables RLS and restricts access to VeriFactu settings and history.
-- Writes are restricted to Service Role (Edge Functions) to ensure encryption.

-- 1. Secure verifactu_settings
ALTER TABLE IF EXISTS public.verifactu_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company owners/admins can view settings" ON public.verifactu_settings;

CREATE POLICY "Company owners/admins can view settings"
ON public.verifactu_settings
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT company_id
    FROM public.company_members
    WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
);

-- 2. Secure verifactu_cert_history
ALTER TABLE IF EXISTS public.verifactu_cert_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company owners/admins can view history" ON public.verifactu_cert_history;

CREATE POLICY "Company owners/admins can view history"
ON public.verifactu_cert_history
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT company_id
    FROM public.company_members
    WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
);
