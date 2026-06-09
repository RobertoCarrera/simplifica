-- Migration: Add INSERT/UPDATE/DELETE RLS policies for bookings table
-- Root cause: only bookings_select existed, so the Supabase client PATCH
-- to save the Google Calendar event ID returned 0 rows (PGRST116 / HTTP 406).
-- INSERT worked because the book_slot RPC is SECURITY DEFINER (bypasses RLS).
-- This migration adds the missing write policies following the same pattern
-- as bookings_select: company members (with elevated roles) OR the
-- professional assigned to the booking.
BEGIN;

-- ── bookings.bookings_insert (INSERT) ──────────────────────────────────────────
-- Allows professionals and company members to insert bookings directly.
-- The primary insert path goes through the book_slot RPC (SECURITY DEFINER)
-- which doesn't need this, but the event-form also does occasional direct
-- inserts (e.g. when linking an existing booking to a Google event).
DROP POLICY IF EXISTS "bookings_insert" ON public.bookings;
CREATE POLICY "bookings_insert" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = bookings.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin','member','agent','developer'])
    )) OR (professional_id = get_auth_user_professional_id())
  );

-- ── bookings.bookings_update (UPDATE) — THE CRITICAL FIX ─────────────────────
-- Without this, PATCH /rest/v1/bookings?id=eq.<uuid> returns 0 rows because
-- RLS blocks every row. The fix in event-form (saving google_event_id after
-- creating the event) and elsewhere needs this to succeed.
DROP POLICY IF EXISTS "bookings_update" ON public.bookings;
CREATE POLICY "bookings_update" ON public.bookings FOR UPDATE TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = bookings.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin','member','agent','developer'])
    )) OR (professional_id = get_auth_user_professional_id())
  )
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = bookings.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin','member','agent','developer'])
    )) OR (professional_id = get_auth_user_professional_id())
  );

-- ── bookings.bookings_delete (DELETE) ──────────────────────────────────────────
-- Symmetric to update — needed for booking cancellation flows.
DROP POLICY IF EXISTS "bookings_delete" ON public.bookings;
CREATE POLICY "bookings_delete" ON public.bookings FOR DELETE TO authenticated
  USING (
    (EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = bookings.company_id
        AND cm.status = 'active'
        AND ar.name = ANY (ARRAY['supervisor','owner','admin','super_admin','member','agent','developer'])
    )) OR (professional_id = get_auth_user_professional_id())
  );

COMMIT;
