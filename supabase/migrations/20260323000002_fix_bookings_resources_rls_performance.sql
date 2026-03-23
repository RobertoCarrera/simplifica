-- ============================================================
-- Fix RLS performance on bookings and resources tables
-- Drops ALL policies that pollute SELECT, replaces with
-- per-command policies using STABLE cached functions.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. Helper: get client IDs for current auth user (SECURITY DEFINER
--    bypasses clients RLS, avoiding expensive planning cascade)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_client_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    array_agg(id),
    '{}'::uuid[]
  )
  FROM clients
  WHERE auth_user_id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- 1. BOOKINGS — replace 2 ALL + 3 overlapping SELECT policies
--    with 1 fast SELECT + per-command write policies
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage bookings" ON bookings;
DROP POLICY IF EXISTS "Admins/Owners can manage bookings" ON bookings;
DROP POLICY IF EXISTS "Clients can insert bookings" ON bookings;
DROP POLICY IF EXISTS "Clients can view their own bookings" ON bookings;
DROP POLICY IF EXISTS "Company members can view bookings" ON bookings;

-- SELECT: company members see their company's bookings, clients see their own
-- Uses get_my_client_ids() (SECURITY DEFINER) to avoid clients RLS planning overhead
CREATE POLICY "bookings_select" ON bookings
  FOR SELECT USING (
    company_id = get_auth_user_company_id()
    OR client_id = ANY(get_my_client_ids())
  );

-- INSERT: admin/owner OR active client of the company
CREATE POLICY "bookings_insert" ON bookings
  FOR INSERT WITH CHECK (
    current_user_is_admin(company_id)
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.auth_user_id = auth.uid()
        AND c.company_id = bookings.company_id
        AND c.is_active = true
    )
  );

-- UPDATE: admin/owner only
CREATE POLICY "bookings_update" ON bookings
  FOR UPDATE USING (current_user_is_admin(company_id));

-- DELETE: admin/owner only
CREATE POLICY "bookings_delete" ON bookings
  FOR DELETE USING (current_user_is_admin(company_id));

-- ─────────────────────────────────────────────────────────────
-- 2. RESOURCES — replace ALL + SELECT with per-command policies
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins/Owners can manage resources" ON resources;
DROP POLICY IF EXISTS "Company members can view resources" ON resources;

CREATE POLICY "resources_select" ON resources
  FOR SELECT USING (company_id = get_auth_user_company_id());

CREATE POLICY "resources_insert" ON resources
  FOR INSERT WITH CHECK (current_user_is_admin(company_id));

CREATE POLICY "resources_update" ON resources
  FOR UPDATE USING (current_user_is_admin(company_id));

CREATE POLICY "resources_delete" ON resources
  FOR DELETE USING (current_user_is_admin(company_id));

-- Add missing index
CREATE INDEX IF NOT EXISTS idx_resources_company_id ON resources(company_id);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
