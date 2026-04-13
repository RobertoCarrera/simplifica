-- ============================================================
-- FIX: Domains table cross-company data leak (OWASP A01)
-- Before: Any authenticated 'owner' could read ALL verified
--         domains regardless of company. No company_id column
--         existed, so tenant isolation was impossible.
-- After:  company_id added, RLS policies scoped by company.
-- ============================================================

-- 1. Add company_id column (nullable initially to allow backfill)
ALTER TABLE public.domains
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2. Backfill skipped: assigned_to_user column no longer exists in domains.
--    New domains will have company_id set by the application layer.

-- 3. Add index for query performance
CREATE INDEX IF NOT EXISTS idx_domains_company_id ON public.domains(company_id);

-- 4. Drop ALL existing domain policies (both the rename migration and the large migration left stale versions)
DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.domains;
DROP POLICY IF EXISTS "Admins can manage domains"                       ON public.domains;
DROP POLICY IF EXISTS "Admins can manage all domains"                   ON public.domains;
DROP POLICY IF EXISTS "Users can insert assigned mail domains"          ON public.domains;
DROP POLICY IF EXISTS "Users can update assigned mail domains"          ON public.domains;
DROP POLICY IF EXISTS "Users can delete assigned mail domains"          ON public.domains;
DROP POLICY IF EXISTS "Users can insert domains"                        ON public.domains;
DROP POLICY IF EXISTS "Users can update own domains"                    ON public.domains;
DROP POLICY IF EXISTS "Users can delete own domains"                    ON public.domains;

-- 5. Helper: get the current user's active company_id
--    (uses the same users table join used across the codebase)
CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- 6. New company-scoped policies

-- SELECT: users see only their own company's domains
--         super_admins / platform admins see all
CREATE POLICY "Users can view own company domains"
ON public.domains FOR SELECT
TO authenticated
USING (
  company_id = public.my_company_id()
  OR EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('admin', 'super_admin')
  )
);

-- INSERT: users can only create domains for their own company
CREATE POLICY "Users can insert own company domains"
ON public.domains FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.my_company_id()
);

-- UPDATE: users can only modify domains in their own company
CREATE POLICY "Users can update own company domains"
ON public.domains FOR UPDATE
TO authenticated
USING (company_id = public.my_company_id());

-- DELETE: users can only delete domains in their own company
CREATE POLICY "Users can delete own company domains"
ON public.domains FOR DELETE
TO authenticated
USING (company_id = public.my_company_id());

-- Super-admin override (platform-level admin, not tenant owner)
CREATE POLICY "Super admins manage all domains"
ON public.domains FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND ar.name IN ('admin', 'super_admin')
  )
);
