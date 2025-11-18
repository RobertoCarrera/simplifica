-- Fix RLS to allow inserting pending_users without company_id during signup
BEGIN;

ALTER TABLE IF EXISTS public.pending_users ENABLE ROW LEVEL SECURITY;

-- Replace generic policy with WITH CHECK so INSERT is allowed
DROP POLICY IF EXISTS "pending_users_company_or_service" ON public.pending_users;
CREATE POLICY "pending_users_company_or_service" ON public.pending_users
  FOR ALL
  USING (
    -- Visible if in same company, or row has no company yet, or service role
    (company_id = get_user_company_id())
    OR (company_id IS NULL)
    OR (auth.jwt() ->> 'role' = 'service_role')
  )
  WITH CHECK (
    -- New/updated rows allowed if they satisfy the same predicate
    (company_id = get_user_company_id())
    OR (company_id IS NULL)
    OR (auth.jwt() ->> 'role' = 'service_role')
  );

COMMIT;
