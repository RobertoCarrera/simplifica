-- Migration: SECURITY FIX — re-isolate professionals' bookings
-- Root cause: the bookings_select RLS policy was modified (outside of versioned
-- migrations) to include 'professional' in the privileged-roles array. As a
-- result, any user with an active 'professional' membership in company_members
-- could see ALL bookings in their company — not just their own.
--
-- Evidence (queried 2026-06-10 on production project ufutyjbqfjrlzkprvyvs):
--   bookings_select.qual = "... AND ar.name = ANY (ARRAY[
--     'supervisor','owner','admin','super_admin',
--     'member','agent','developer','professional'  ← THIS is the leak
--   ])) OR (professional_id = get_auth_user_professional_id())"
--
-- The first OR-branch is TRUE for anyone with an active professional membership,
-- so the per-professional filter (the second branch) never fires.
--
-- Fix: rebuild bookings_select with a clean privileged-roles list (no
-- 'professional', no 'member'/'agent'/'developer'). Professionals fall through
-- to the second branch and only see their own.
--
-- Also rebuild INSERT/UPDATE/DELETE to keep them symmetric. Without symmetry,
-- a professional could UPDATE a booking's notes/status even though they cannot
-- see it in the list — same underlying data leak.
--
-- Privileged roles that can manage all company bookings:
--   supervisor, owner, admin, super_admin
-- (member / agent / developer are NOT privileged for booking data — they
--  should not have read access to other professionals' reservations.)

BEGIN;

-- ─── bookings_select ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;
CREATE POLICY "bookings_select" ON public.bookings FOR SELECT TO authenticated
  USING (
    (
      -- Privileged company members: see all bookings in their company
      EXISTS (
        SELECT 1
        FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN app_roles ar ON ar.id = cm.role_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = bookings.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
      )
    )
    OR
    (
      -- Professionals: see only their own bookings
      bookings.professional_id = public.get_auth_user_professional_id()
    )
  );

-- ─── bookings_insert ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bookings_insert" ON public.bookings;
CREATE POLICY "bookings_insert" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN app_roles ar ON ar.id = cm.role_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = bookings.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
      )
    )
    OR
    (
      -- A professional can only create bookings assigned to themselves
      bookings.professional_id = public.get_auth_user_professional_id()
    )
  );

-- ─── bookings_update ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bookings_update" ON public.bookings;
CREATE POLICY "bookings_update" ON public.bookings FOR UPDATE TO authenticated
  USING (
    (
      EXISTS (
        SELECT 1 FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN app_roles ar ON ar.id = cm.role_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = bookings.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
      )
    )
    OR
    (
      bookings.professional_id = public.get_auth_user_professional_id()
    )
  )
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN app_roles ar ON ar.id = cm.role_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = bookings.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
      )
    )
    OR
    (
      -- Prevent privilege escalation: a professional cannot reassign a booking
      -- to another professional via UPDATE
      bookings.professional_id = public.get_auth_user_professional_id()
    )
  );

-- ─── bookings_delete ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bookings_delete" ON public.bookings;
CREATE POLICY "bookings_delete" ON public.bookings FOR DELETE TO authenticated
  USING (
    (
      EXISTS (
        SELECT 1 FROM company_members cm
        JOIN users u ON u.id = cm.user_id
        JOIN app_roles ar ON ar.id = cm.role_id
        WHERE u.auth_user_id = auth.uid()
          AND cm.company_id = bookings.company_id
          AND cm.status = 'active'
          AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin'])
      )
    )
    OR
    (
      bookings.professional_id = public.get_auth_user_professional_id()
    )
  );

-- ─── Sanity assertion (will abort the migration if the leak is still there) ─
DO $$
DECLARE
  v_qual text;
BEGIN
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE tablename = 'bookings' AND policyname = 'bookings_select' AND cmd = 'SELECT';

  IF v_qual LIKE '%professional%' AND v_qual LIKE '%company_members%' THEN
    RAISE EXCEPTION 'SECURITY: bookings_select still grants elevated access to ''professional'' role. Migration aborted.';
  END IF;

  RAISE NOTICE 'SECURITY OK: bookings_select rebuilt without professional role leak';
END $$;

COMMIT;
