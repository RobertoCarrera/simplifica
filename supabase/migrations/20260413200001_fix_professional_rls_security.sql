-- Migration: Fix RLS security gap for deactivated professionals
-- When a professional is offboarded (professionals.is_active = false),
-- they must NOT be able to access any data even if company_members.status
-- was not correctly updated. Belt-and-suspenders approach.
--
-- Affected tables:
--   1. clients (via can_view_client function)
--   2. professional_schedules (4 policies)
--   3. professional_blocked_dates (4 policies)
--   4. booking_clinical_notes (4 policies) — company_members.status check already exists,
--      adding professional.is_active check as defense-in-depth
--   5. booking_documents (4 policies) — same as above

-- =============================================================================
-- 1. Fix can_view_client() — Non-admin staff path
--    Add check: if user has a professionals record, it must be is_active = true
-- =============================================================================
CREATE OR REPLACE FUNCTION public.can_view_client(
  p_client_company_id uuid,
  p_client_auth_user_id uuid,
  p_client_created_by uuid,
  p_client_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_public_user_id uuid;
BEGIN
  -- Fast path 1: client accessing own record
  IF p_client_auth_user_id = auth.uid() THEN
    RETURN true;
  END IF;

  -- Fast path 2: creator always sees their clients
  IF p_client_created_by = auth.uid() THEN
    RETURN true;
  END IF;

  -- Fast path 3: admin/owner of the company sees all clients
  IF p_client_company_id = ANY(get_my_company_ids()) THEN
    -- Check if user is admin/owner (most staff are)
    IF current_user_is_admin(p_client_company_id) THEN
      RETURN true;
    END IF;

    -- Non-admin staff: check assignment AND that their professional record is active
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_user_id = auth.uid()
    LIMIT 1;

    IF v_public_user_id IS NOT NULL THEN
      -- Verify: if user has a professional record in this company, it must be active
      IF EXISTS (
        SELECT 1 FROM public.professionals
        WHERE user_id = v_public_user_id
          AND company_id = p_client_company_id
          AND is_active = false
      ) THEN
        RETURN false;
      END IF;

      RETURN EXISTS (
        SELECT 1
        FROM public.company_members cm
        JOIN public.client_assignments ca ON ca.company_member_id = cm.id
        WHERE cm.user_id = v_public_user_id
          AND cm.company_id = p_client_company_id
          AND cm.status = 'active'
          AND ca.client_id = p_client_id
      );
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- =============================================================================
-- 2. Fix professional_schedules — add p.is_active = true
-- =============================================================================
DROP POLICY IF EXISTS "professional_schedules_select" ON professional_schedules;
CREATE POLICY "professional_schedules_select" ON professional_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND p.company_id = get_user_company_id()
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "professional_schedules_insert" ON professional_schedules;
CREATE POLICY "professional_schedules_insert" ON professional_schedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND p.is_active = true
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id))
    )
  );

DROP POLICY IF EXISTS "professional_schedules_update" ON professional_schedules;
CREATE POLICY "professional_schedules_update" ON professional_schedules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND p.is_active = true
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id))
    )
  );

DROP POLICY IF EXISTS "professional_schedules_delete" ON professional_schedules;
CREATE POLICY "professional_schedules_delete" ON professional_schedules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND p.is_active = true
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id))
    )
  );

-- =============================================================================
-- 3. Fix professional_blocked_dates — add professional is_active check
--    Also restrict to own professional record or admin (was company-wide before)
-- =============================================================================
DROP POLICY IF EXISTS "blocked_dates_select" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_select" ON professional_blocked_dates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_blocked_dates.professional_id
        AND p.company_id = (SELECT company_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "blocked_dates_insert" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_insert" ON professional_blocked_dates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_blocked_dates.professional_id
        AND p.is_active = true
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id))
    )
  );

DROP POLICY IF EXISTS "blocked_dates_update" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_update" ON professional_blocked_dates
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_blocked_dates.professional_id
        AND p.is_active = true
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id))
    )
  );

DROP POLICY IF EXISTS "blocked_dates_delete" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_delete" ON professional_blocked_dates
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_blocked_dates.professional_id
        AND p.is_active = true
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id))
    )
  );

-- =============================================================================
-- 4. Fix booking_clinical_notes — defense-in-depth: add professional active check
--    The cm.status = 'active' already exists, but if offboarding only deactivates
--    the professional without suspending the member, this catches it.
-- =============================================================================
DROP POLICY IF EXISTS "booking_clinical_notes_select_policy" ON public.booking_clinical_notes;
CREATE POLICY "booking_clinical_notes_select_policy" ON public.booking_clinical_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.clients c ON b.client_id = c.id
      JOIN public.company_members cm ON c.company_id = cm.company_id
      LEFT JOIN public.professionals p ON p.user_id = cm.user_id AND p.company_id = cm.company_id
      WHERE b.id = booking_clinical_notes.booking_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
        AND (p.id IS NULL OR p.is_active = true)
    )
  );

DROP POLICY IF EXISTS "booking_clinical_notes_insert_policy" ON public.booking_clinical_notes;
CREATE POLICY "booking_clinical_notes_insert_policy" ON public.booking_clinical_notes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.clients c ON b.client_id = c.id
      JOIN public.company_members cm ON c.company_id = cm.company_id
      LEFT JOIN public.professionals p ON p.user_id = cm.user_id AND p.company_id = cm.company_id
      WHERE b.id = booking_clinical_notes.booking_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
        AND (p.id IS NULL OR p.is_active = true)
    )
  );

DROP POLICY IF EXISTS "booking_clinical_notes_update_policy" ON public.booking_clinical_notes;
CREATE POLICY "booking_clinical_notes_update_policy" ON public.booking_clinical_notes
  FOR UPDATE USING (
    created_by = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.clients c ON b.client_id = c.id
      JOIN public.company_members cm ON c.company_id = cm.company_id
      LEFT JOIN public.professionals p ON p.user_id = cm.user_id AND p.company_id = cm.company_id
      WHERE b.id = booking_clinical_notes.booking_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
        AND (p.id IS NULL OR p.is_active = true)
    )
  );

DROP POLICY IF EXISTS "booking_clinical_notes_delete_policy" ON public.booking_clinical_notes;
CREATE POLICY "booking_clinical_notes_delete_policy" ON public.booking_clinical_notes
  FOR DELETE USING (
    (created_by = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()))
    OR
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.clients c ON b.client_id = c.id
      JOIN public.company_members cm ON c.company_id = cm.company_id
      JOIN public.app_roles ar ON cm.role_id = ar.id
      WHERE b.id = booking_clinical_notes.booking_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin', 'super_admin')
    )
  );

-- =============================================================================
-- 5. Fix booking_documents — same defense-in-depth pattern
-- =============================================================================
DROP POLICY IF EXISTS "booking_documents_select_policy" ON public.booking_documents;
CREATE POLICY "booking_documents_select_policy" ON public.booking_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.clients c ON b.client_id = c.id
      JOIN public.company_members cm ON c.company_id = cm.company_id
      LEFT JOIN public.professionals p ON p.user_id = cm.user_id AND p.company_id = cm.company_id
      WHERE b.id = booking_documents.booking_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
        AND (p.id IS NULL OR p.is_active = true)
    )
  );

DROP POLICY IF EXISTS "booking_documents_insert_policy" ON public.booking_documents;
CREATE POLICY "booking_documents_insert_policy" ON public.booking_documents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.clients c ON b.client_id = c.id
      JOIN public.company_members cm ON c.company_id = cm.company_id
      LEFT JOIN public.professionals p ON p.user_id = cm.user_id AND p.company_id = cm.company_id
      WHERE b.id = booking_documents.booking_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
        AND (p.id IS NULL OR p.is_active = true)
    )
  );

DROP POLICY IF EXISTS "booking_documents_update_policy" ON public.booking_documents;
CREATE POLICY "booking_documents_update_policy" ON public.booking_documents
  FOR UPDATE USING (
    created_by = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.clients c ON b.client_id = c.id
      JOIN public.company_members cm ON c.company_id = cm.company_id
      LEFT JOIN public.professionals p ON p.user_id = cm.user_id AND p.company_id = cm.company_id
      WHERE b.id = booking_documents.booking_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
        AND (p.id IS NULL OR p.is_active = true)
    )
  );

DROP POLICY IF EXISTS "booking_documents_delete_policy" ON public.booking_documents;
CREATE POLICY "booking_documents_delete_policy" ON public.booking_documents
  FOR DELETE USING (
    (created_by = (SELECT id FROM public.users WHERE auth_user_id = auth.uid()))
    OR
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.clients c ON b.client_id = c.id
      JOIN public.company_members cm ON c.company_id = cm.company_id
      JOIN public.app_roles ar ON cm.role_id = ar.id
      WHERE b.id = booking_documents.booking_id
        AND cm.user_id = (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin', 'super_admin')
    )
  );

-- =============================================================================
-- 6. Fix client_assignments — add active member + professional checks
-- =============================================================================
DROP POLICY IF EXISTS "View assignments" ON public.client_assignments;
CREATE POLICY "View assignments" ON public.client_assignments
  FOR SELECT USING (
    -- My own assignment (and I'm still an active professional)
    (
      company_member_id IN (
        SELECT cm.id FROM public.company_members cm
        LEFT JOIN public.professionals p ON p.user_id = cm.user_id AND p.company_id = cm.company_id
        WHERE cm.user_id = auth.uid()
          AND cm.status = 'active'
          AND (p.id IS NULL OR p.is_active = true)
      )
    )
    OR
    -- Admin/Owner of the same company
    EXISTS (
      SELECT 1
      FROM public.company_members requester
      JOIN public.app_roles ar ON requester.role_id = ar.id
      JOIN public.company_members target_member ON target_member.id = client_assignments.company_member_id
      WHERE requester.user_id = auth.uid()
        AND requester.company_id = target_member.company_id
        AND requester.status = 'active'
        AND ar.name IN ('owner', 'admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Manage assignments" ON public.client_assignments;
CREATE POLICY "Manage assignments" ON public.client_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM public.company_members requester
      JOIN public.app_roles ar ON requester.role_id = ar.id
      JOIN public.company_members target_member ON target_member.id = client_assignments.company_member_id
      WHERE requester.user_id = auth.uid()
        AND requester.company_id = target_member.company_id
        AND ar.name IN ('owner', 'admin', 'super_admin')
        AND requester.status = 'active'
    )
  );
