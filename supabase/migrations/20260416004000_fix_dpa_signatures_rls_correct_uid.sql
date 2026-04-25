-- Fix RLS policies for dpa_signatures
-- Root cause: company_members.user_id is the INTERNAL public.users.id, NOT auth.uid().
-- auth.uid() = auth.users.id = public.users.auth_user_id (different column!)
-- Previous migration (20260416002000) used u.id = auth.uid() — still wrong.
-- The helper get_my_company_ids() already handles this correctly internally:
--   WHERE user_id = (SELECT id FROM users WHERE auth_user_id = auth.uid())
-- So we use get_my_company_ids() for the membership path, and auth_user_id for the fallback path.

DROP POLICY IF EXISTS "dpa_signatures_insert_own_company" ON public.dpa_signatures;
DROP POLICY IF EXISTS "dpa_signatures_select_own_company" ON public.dpa_signatures;

-- INSERT: allow if user has active company membership, OR if user has a company_id in users table
CREATE POLICY "dpa_signatures_insert_own_company" ON public.dpa_signatures
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = ANY(public.get_my_company_ids())
    OR company_id IN (
      SELECT u.company_id FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.company_id IS NOT NULL
    )
  );

-- SELECT: same logic
CREATE POLICY "dpa_signatures_select_own_company" ON public.dpa_signatures
  FOR SELECT TO authenticated
  USING (
    company_id = ANY(public.get_my_company_ids())
    OR company_id IN (
      SELECT u.company_id FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.company_id IS NOT NULL
    )
  );
