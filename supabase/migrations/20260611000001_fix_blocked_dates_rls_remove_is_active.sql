-- ============================================
-- Migration: fix_blocked_dates_rls_remove_is_active
-- Date: 2026-06-11
-- Description:
--   Remove p.is_active = true check from Path A of blocked_dates_select policy.
--
--   Problem: When a professional is deactivated (is_active = false) but still
--   has is_public = true (e.g. on leave but still taking bookings), they should
--   still be able to see and manage their blocked dates.
--
--   The p.is_active = true check in Path A prevents the professional from
--   seeing their own blocked dates when is_active = false.
--
--   Fix: Remove the is_active check from Path A (professional's own blocked dates).
--   Path B (admin view) stays unchanged - admins see all blocked dates regardless
--   of professional's is_active status.
-- ============================================

DROP POLICY IF EXISTS "blocked_dates_select" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_select" ON professional_blocked_dates
  FOR SELECT USING (
    -- Path A: the professional who owns the blocked dates record
    -- (can see their own blocked dates regardless of is_active status)
    EXISTS (
      SELECT 1 FROM professionals p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = professional_blocked_dates.professional_id
        AND u.auth_user_id = auth.uid()
        -- Removed: AND p.is_active = true
        -- Professional should see their blocks even if deactivated
    )
    OR
    -- Path B: admin/owner/supervisor/super_admin of the blocked dates' company
    -- (sees all blocked dates in their company)
    EXISTS (
      SELECT 1
      FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      JOIN app_roles ar ON ar.id = cm.role_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.company_id = professional_blocked_dates.company_id
        AND cm.status = 'active'
        AND ar.name IN ('owner', 'admin', 'supervisor', 'super_admin')
    )
  );