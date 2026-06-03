-- Migration: Fix RLS isolation — professionals seeing all company data
-- Date: 2026-06-03
-- Bug: Professionals with role='professional' could see ALL company bookings and ALL clients
-- Root cause:
--   1. bookings_select: OR logic — company_id match short-circuits, bypassing professional filter
--   2. clients_select: only checks company membership, never crosses with client_assignments
-- Fix:
--   1. bookings_select: separate admin/owner path (all company) from professional path (own only)
--   2. clients_select: professionals/members must be in client_assignments for that client
--
-- SAFETY: The booking modal uses getClientsBasic() which does its own filtering via
-- client_assignments — it does NOT rely on these RLS policies. The calendar uses
-- loadCalendarEvents() which passes professionalId explicitly and has a fail-safe.
-- Both features are unaffected by these RLS changes.

BEGIN;

-- =============================================================================
-- Fix 1: bookings_select — replace OR with role-aware logic
-- Before: (company_id = get_auth_user_company_id()) OR (professional_id = ...)
--          → Any company member passes first condition → sees ALL bookings
-- After:  Admins/owners → all company bookings
--         Professionals → only bookings where professional_id = their own
-- =============================================================================
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;

CREATE POLICY "bookings_select" ON public.bookings FOR SELECT USING (
  -- Path A: admins/owners see all bookings in their company
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = bookings.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
  OR
  -- Path B: professionals see ONLY their own bookings
  -- (get_auth_user_professional_id returns NULL for non-professionals so they won't match)
  professional_id = public.get_auth_user_professional_id()
);

-- =============================================================================
-- Fix 2: clients_select — restrict professionals/members to assigned clients only
-- Before: any company member (all roles) could see ALL company clients
-- After:  admins/owners → all company clients
--         professionals/members → only clients in their client_assignments
-- =============================================================================
DROP POLICY IF EXISTS "clients_select" ON public.clients;

CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
USING (
  -- Path A: admins/owners see all clients in their company
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.app_roles ar ON u.app_role_id = ar.id
    WHERE u.auth_user_id = auth.uid()
      AND u.company_id = clients.company_id
      AND ar.name IN ('owner', 'admin', 'super_admin')
  )
  OR
  -- Path B: staff (professional/member/agent) see only assigned clients
  EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.company_members cm
      ON cm.user_id = u.id
      AND cm.company_id = clients.company_id
      AND cm.status = 'active'
    JOIN public.client_assignments ca
      ON ca.company_member_id = cm.id
      AND ca.client_id = clients.id
    WHERE u.auth_user_id = auth.uid()
  )
);

-- Keep INSERT policy for professionals (they need to create clients for booking)
-- Keep UPDATE/DELETE policies unchanged for now

-- Verify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bookings' AND policyname = 'bookings_select'
  ) THEN
    RAISE EXCEPTION 'bookings_select policy was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'clients' AND policyname = 'clients_select'
  ) THEN
    RAISE EXCEPTION 'clients_select policy was not created';
  END IF;
END $$;

COMMIT;
