-- Migration: Fix bookings RLS to isolate professional data
-- Purpose: Professionals must only see their own bookings, not all bookings from the company.
--          This fixes the bug where Eva Cañete (professional role) could see all professionals' bookings.
--
-- Fix: Add professional_id filter to bookings_select policy
--       Create helper function to get current user's professional_id (if they are a professional)

-- ──────────────────────────────────────────────────────────────
-- Helper function: get the professional_id for the authenticated user
-- Returns NULL if user is not a professional (not linked to professionals table)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_auth_user_professional_id()
RETURNS UUID AS $$
  SELECT p.id
  FROM professionals p
  JOIN users u ON u.auth_user_id = p.user_id
  WHERE u.id = auth.uid()
    AND p.is_active = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Grant access so RLS policy can call it
GRANT EXECUTE ON FUNCTION public.get_auth_user_professional_id() TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- Update bookings_select policy: add professional filter
-- Before: company_id = get_auth_user_company_id()
-- After:  company_id = get_auth_user_company_id()
--         OR professional_id = get_auth_user_professional_id()  -- a professional sees only their own bookings
-- ──────────────────────────────────────────────────────────────

-- Drop existing policy first
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;

-- Recreate with professional isolation
CREATE POLICY "bookings_select" ON public.bookings FOR SELECT USING (
  (
    -- Owner/admin/other roles: see all bookings in their company
    company_id = get_auth_user_company_id()
  )
  OR
  (
    -- Professionals: see ONLY their own bookings (professional_id = their professional record)
    professional_id = public.get_auth_user_professional_id()
  )
);

-- Verify the policy was created correctly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bookings'
      AND policyname = 'bookings_select'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Failed to create bookings_select policy';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- Verify: test the function returns correct professional_id for Eva Cañete
-- (This is a comment/assertion, not executable code that affects production)
-- SELECT get_auth_user_professional_id();  -- should return 1b091f67-2430-43cf-8c35-138db613f0a6 for Eva
-- ──────────────────────────────────────────────────────────────

COMMENT ON FUNCTION public.get_auth_user_professional_id() IS
  'Returns the active professional_id for the authenticated user. Returns NULL if user is not a professional. Used by RLS policies to isolate professional data.';