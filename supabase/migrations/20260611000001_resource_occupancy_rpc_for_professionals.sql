-- Migration: Allow professionals to see resource-occupying bookings for
-- cross-professional resource availability checks.
--
-- Root cause: the 20260610000004 RLS rebuild removed 'professional' from
-- the privileged-roles array in bookings_select. As a result, the modal's
-- "free resources" check (which queries allBookings to detect global room
-- conflicts) returns only the pro's own bookings — never the OTHER
-- professionals' bookings that actually occupy the rooms. Symptom: the
-- resource selector always shows N resources as available even when all
-- are booked, because the conflicting bookings are invisible to the RLS.
--
-- The original isolation intent (professionals only see their own
-- booking data) is preserved — we just add a narrow exception: a
-- professional can see bookings from ANY professional in the SAME company
-- IF AND ONLY IF the booking has a resource_id assigned AND the time range
-- overlaps with one of the requesting professional's own bookings (or
-- always, for a minimal "resource is taken at this slot" signal).
--
-- Simpler & safer approach: allow the professional to see ONLY the
-- minimal resource-occupancy metadata of OTHER professionals' bookings
-- in the same company: id, company_id, professional_id, resource_id,
-- start_time, end_time, status. We enforce this with a SECURITY DEFINER
-- RPC used by the frontend (so the base table RLS stays strict).
--
-- This migration creates the RPC. The frontend (booking-settings) is
-- updated in a follow-up commit to call this RPC instead of getBookings
-- for the allCompanyBookings list.

BEGIN;

-- ─── RPC: get_resource_occupancy_for_company ───────────────────────────────
-- Returns minimal metadata (id, professional_id, resource_id, start, end,
-- status) for all bookings in the company that have a resource_id assigned.
-- Used by the booking modal to compute free resources for the active
-- professional — without exposing client names, notes, totals, or other
-- sensitive booking fields.
--
-- SECURITY DEFINER + explicit auth.uid() check + explicit company_id scope
-- + minimal column set. The RLS policies on bookings remain strict; this
-- function is the ONLY way a non-privileged user gets a "who has this
-- room booked right now" signal.
CREATE OR REPLACE FUNCTION public.get_resource_occupancy_for_company(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  id uuid,
  professional_id uuid,
  resource_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Defense in depth: verify the caller is a member of p_company_id.
  -- Without this, a malicious user with any JWT could enumerate room
  -- occupancy across all companies.
  IF NOT EXISTS (
    SELECT 1
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE u.auth_user_id = auth.uid()
      AND cm.company_id = p_company_id
      AND cm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'not_a_member_of_company'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  RETURN QUERY
  SELECT b.id, b.professional_id, b.resource_id, b.start_time, b.end_time, b.status
  FROM bookings b
  WHERE b.company_id = p_company_id
    AND b.resource_id IS NOT NULL
    AND b.status != 'cancelled'
    AND b.start_time < p_to
    AND b.end_time > p_from
  ORDER BY b.start_time;
END;
$$;

-- Restrict execution to authenticated users (anon can't call it).
REVOKE ALL ON FUNCTION public.get_resource_occupancy_for_company(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_resource_occupancy_for_company(uuid, timestamptz, timestamptz) TO authenticated;

COMMIT;
