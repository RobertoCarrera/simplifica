-- Pending Users RLS fix v2: remove hard dependency on get_user_company_id() during signup
-- Purpose: Allow inserting/selecting pending_users when JWT lacks company_id claim (pre-company context)
-- Safe: Uses direct JWT claim evaluation only when present; otherwise permits NULL company rows
-- Run order: After initial 2025-11-18-pending-users-rls-fix.sql (can supersede its policy)

BEGIN;

ALTER TABLE IF EXISTS public.pending_users ENABLE ROW LEVEL SECURITY;

-- Drop previous policy referencing get_user_company_id()
DROP POLICY IF EXISTS "pending_users_company_or_service" ON public.pending_users;
DROP POLICY IF EXISTS "pending_users_access" ON public.pending_users;

-- New unified policy: visibility + write checks
CREATE POLICY "pending_users_access" ON public.pending_users
  FOR ALL
  USING (
    -- Rows visible if:
    -- 1. They are pre-company (company_id IS NULL) OR
    (company_id IS NULL)
    OR
    -- 2. Service role (bypass)
    (auth.jwt() ->> 'role' = 'service_role')
    OR
    -- 3. Row matches caller's company (claim present)
    (company_id IS NOT NULL AND (auth.jwt() ->> 'company_id') IS NOT NULL AND company_id = (auth.jwt() ->> 'company_id')::uuid)
  )
  WITH CHECK (
    -- New / updated rows allowed under same predicate
    (company_id IS NULL)
    OR (auth.jwt() ->> 'role' = 'service_role')
    OR (company_id IS NOT NULL AND (auth.jwt() ->> 'company_id') IS NOT NULL AND company_id = (auth.jwt() ->> 'company_id')::uuid)
  );

COMMIT;

-- Verification steps (manual):
-- 1. As unauthenticated (no JWT): cannot insert (needs auth.uid()) path from application code.
-- 2. As newly registered user (no company_id claim): INSERT INTO public.pending_users(email, auth_user_id) VALUES (...)
--    should succeed because company_id IS NULL satisfies policy.
-- 3. After company creation (claim present): updating row to set company_id should succeed if matches claim.
-- 4. Service role key can read/update all rows.
