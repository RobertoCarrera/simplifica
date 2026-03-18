-- ============================================================
-- FIX: inbound_email_audit cross-company data leak (OWASP A01)
-- Before: Any authenticated user could read ALL inbound email
--         logs regardless of company (no RLS in place).
-- After:  RLS enabled – users see only their own company's logs;
--         super_admins see all (needed for platform admin panel).
-- ============================================================

-- 1. Enable RLS
ALTER TABLE public.inbound_email_audit ENABLE ROW LEVEL SECURITY;

-- 2. Drop any stale policies that might exist
DROP POLICY IF EXISTS "Users can view own company inbound logs"  ON public.inbound_email_audit;
DROP POLICY IF EXISTS "Super admins can view all inbound logs"   ON public.inbound_email_audit;
DROP POLICY IF EXISTS "Service role can insert inbound logs"     ON public.inbound_email_audit;

-- 3. SELECT: users see only their own company's logs
CREATE POLICY "Users can view own company inbound logs"
ON public.inbound_email_audit FOR SELECT
TO authenticated
USING (
  company_id = public.my_company_id()
  OR public.is_super_admin_real()
);

-- Note: INSERT is performed server-side by the process-inbound-email Edge Function
-- using the service_role key, which bypasses RLS entirely. No INSERT policy needed.
