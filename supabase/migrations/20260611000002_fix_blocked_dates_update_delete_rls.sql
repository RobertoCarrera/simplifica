-- ============================================
-- Migration: fix blocked_dates_update RLS for multi-company professionals
-- Hija del trabajo de bloqueos cross-company de junio 2026.
--
-- Mismo bug que el fix de SELECT: el path del profesional dueño usa
--   p.user_id = auth.uid()
-- que falla para usuarios multi-company (Roberto es owner de Simplifica
-- y supervisor de CAIBS — su professional está en CAIBS pero auth.uid()
-- es auth.users.id, no public.users.id).
--
-- También: el `AND p.is_active = true` bloquea a profesionales inactivos
-- que aún quieren gestionar sus bloqueos históricos.
--
-- Fix: usar el mismo join correcto que aplicamos en SELECT, y quitar
-- el filtro de is_active.
-- ============================================

DROP POLICY IF EXISTS "blocked_dates_update" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_update" ON professional_blocked_dates
  FOR UPDATE USING (
    -- Path A: el profesional dueño del registro (en cualquier company)
    EXISTS (
      SELECT 1 FROM professionals p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = professional_blocked_dates.professional_id
        AND u.auth_user_id = auth.uid()
    )
    OR
    -- Path B: admin/owner/supervisor/super_admin de la company del bloqueo
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

-- También para DELETE (mismo bug aplica)
DROP POLICY IF EXISTS "blocked_dates_delete" ON professional_blocked_dates;
CREATE POLICY "blocked_dates_delete" ON professional_blocked_dates
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = professional_blocked_dates.professional_id
        AND u.auth_user_id = auth.uid()
    )
    OR
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
