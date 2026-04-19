-- ============================================
-- Fix professional_blocked_dates RLS
-- ============================================
-- BEFORE: any professional in the company could see ALL blocked dates
-- AFTER:  owner/super_admin see all; professionals only see their own
--         INSERT/UPDATE/DELETE restricted to own professional_id or admin
-- ============================================

-- Helper: check if user is admin (owner or super_admin) in a company
-- Uses existing company_members + app_roles pattern

DROP POLICY IF EXISTS "blocked_dates_select" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_select" ON professional_blocked_dates
  FOR SELECT USING (
    -- Owner / super_admin: see all blocked dates in their company
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = professional_blocked_dates.company_id
        AND cm.is_active = true
        AND ar.name IN ('owner', 'super_admin')
    )
    OR
    -- Professional: see only their own blocked dates
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_blocked_dates.professional_id
        AND p.user_id = auth.uid()
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "blocked_dates_insert" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_insert" ON professional_blocked_dates
  FOR INSERT WITH CHECK (
    -- Owner / super_admin: can block dates for any professional in their company
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = professional_blocked_dates.company_id
        AND cm.is_active = true
        AND ar.name IN ('owner', 'super_admin')
    )
    OR
    -- Professional: can only block their OWN dates
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_blocked_dates.professional_id
        AND p.user_id = auth.uid()
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "blocked_dates_update" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_update" ON professional_blocked_dates
  FOR UPDATE USING (
    -- Owner / super_admin: can update any blocked date in their company
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = professional_blocked_dates.company_id
        AND cm.is_active = true
        AND ar.name IN ('owner', 'super_admin')
    )
    OR
    -- Professional: can only update their own blocked dates
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_blocked_dates.professional_id
        AND p.user_id = auth.uid()
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "blocked_dates_delete" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_delete" ON professional_blocked_dates
  FOR DELETE USING (
    -- Owner / super_admin: can delete any blocked date in their company
    EXISTS (
      SELECT 1 FROM public.company_members cm
      JOIN public.app_roles ar ON ar.id = cm.role_id
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = professional_blocked_dates.company_id
        AND cm.is_active = true
        AND ar.name IN ('owner', 'super_admin')
    )
    OR
    -- Professional: can only delete their own blocked dates
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_blocked_dates.professional_id
        AND p.user_id = auth.uid()
        AND p.is_active = true
    )
  );
