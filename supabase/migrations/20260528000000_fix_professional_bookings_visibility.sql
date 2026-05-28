-- Migration: Fix professionals unable to see their bookings/reservations
-- Root cause: get_auth_user_professional_id() had two join bugs:
--   1. JOIN users u ON u.auth_user_id = p.user_id
--      → comparing auth.users.id (auth_user_id) with public.users.id (user_id FK)
--      These are DIFFERENT UUIDs — the join never produces a match.
--   2. WHERE u.id = auth.uid()
--      → comparing public.users.id with auth.users.id
--      These are DIFFERENT UUIDs — the filter never passes.
-- Result: the function always returns NULL, so professionals never match
--         bookings.professional_id = NULL → no bookings visible to professionals.

-- Fix 1: Correct the get_auth_user_professional_id() function
CREATE OR REPLACE FUNCTION public.get_auth_user_professional_id()
RETURNS UUID AS $$
  SELECT p.id
  FROM professionals p
  JOIN users u ON u.id = p.user_id           -- public.users.id = professionals.user_id (FK)
  WHERE u.auth_user_id = auth.uid()           -- public.users.auth_user_id = auth.uid()
    AND p.is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Fix 2: Ensure get_auth_user_company_id exists (used by bookings_select RLS)
-- This function is referenced in bookings_select policy but was never defined in any migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_auth_user_company_id'
  ) THEN
    CREATE FUNCTION public.get_auth_user_company_id()
    RETURNS UUID AS $$
      SELECT company_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
    $$ LANGUAGE sql STABLE SECURITY DEFINER;
  END IF;
END $$;

-- Ensure both functions are accessible to the RLS system
GRANT EXECUTE ON FUNCTION public.get_auth_user_professional_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_company_id() TO authenticated;

-- Verify: log that the functions exist after migration
DO $$
DECLARE
  v_test_id UUID;
BEGIN
  v_test_id := public.get_auth_user_professional_id();
  -- v_test_id will be NULL if not logged in as a professional, which is expected
  -- The important thing is the function doesn't ERROR
  RAISE NOTICE 'get_auth_user_professional_id() executed successfully (result: %)', v_test_id;
  
  v_test_id := public.get_auth_user_company_id();
  RAISE NOTICE 'get_auth_user_company_id() executed successfully (result: %)', v_test_id;
END $$;
