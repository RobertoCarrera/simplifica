-- Migration: rls-superadmin-bypass-for-professionals
-- Grants superadmins the same RLS visibility (SELECT/INSERT/UPDATE/DELETE)
-- on the professionals + related tables that an owner/admin of the target
-- company would have, regardless of the superadmin's own company_id.
--
-- Background:
-- The current policies filter by `company_id = get_auth_user_company_id()`,
-- which resolves to the superadmin's own company (not the company the user
-- is currently viewing). This causes the "Reservas > Configuración >
-- Profesionales" list to come back empty when a superadmin inspects a
-- customer company.
--
-- Fix:
-- 1. Recreate SELECT policies with `OR is_super_admin_real()`.
-- 2. Recreate INSERT/UPDATE/DELETE policies to grant superadmins the same
--    effective access as `current_user_is_admin(company_id)` would.
--
-- The bypass reuses the existing `is_super_admin_real()` helper (STABLE,
-- SECURITY DEFINER, checks users.app_role = 'super_admin' AND active).

-- ============================================================
-- 1. PROFESSIONALS
-- ============================================================

DROP POLICY IF EXISTS "professionals_select" ON professionals;

CREATE POLICY "professionals_select" ON professionals
  FOR SELECT USING (
    company_id = get_auth_user_company_id()
    OR is_super_admin_real()
  );

DROP POLICY IF EXISTS "professionals_insert" ON professionals;
DROP POLICY IF EXISTS "professionals_update" ON professionals;
DROP POLICY IF EXISTS "professionals_delete" ON professionals;

CREATE POLICY "professionals_insert" ON professionals
  FOR INSERT WITH CHECK (
    current_user_is_admin(company_id)
    OR is_super_admin_real()
  );

CREATE POLICY "professionals_update" ON professionals
  FOR UPDATE USING (
    current_user_is_admin(company_id)
    OR is_super_admin_real()
  );

CREATE POLICY "professionals_delete" ON professionals
  FOR DELETE USING (
    current_user_is_admin(company_id)
    OR is_super_admin_real()
  );

-- ============================================================
-- 2. PROFESSIONAL_SERVICES
-- ============================================================

DROP POLICY IF EXISTS "professional_services_select" ON professional_services;
DROP POLICY IF EXISTS "professional_services_insert" ON professional_services;
DROP POLICY IF EXISTS "professional_services_update" ON professional_services;
DROP POLICY IF EXISTS "professional_services_delete" ON professional_services;

CREATE POLICY "professional_services_select" ON professional_services
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_services.professional_id
        AND (p.company_id = get_auth_user_company_id() OR is_super_admin_real())
    )
  );

CREATE POLICY "professional_services_insert" ON professional_services
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_services.professional_id
        AND (current_user_is_admin(p.company_id) OR is_super_admin_real())
    )
  );

CREATE POLICY "professional_services_update" ON professional_services
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_services.professional_id
        AND (current_user_is_admin(p.company_id) OR is_super_admin_real())
    )
  );

CREATE POLICY "professional_services_delete" ON professional_services
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_services.professional_id
        AND (current_user_is_admin(p.company_id) OR is_super_admin_real())
    )
  );

-- ============================================================
-- 3. PROFESSIONAL_SCHEDULES
-- ============================================================

DROP POLICY IF EXISTS "professional_schedules_select" ON professional_schedules;
DROP POLICY IF EXISTS "professional_schedules_insert" ON professional_schedules;
DROP POLICY IF EXISTS "professional_schedules_update" ON professional_schedules;
DROP POLICY IF EXISTS "professional_schedules_delete" ON professional_schedules;

CREATE POLICY "professional_schedules_select" ON professional_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND (p.company_id = get_auth_user_company_id() OR is_super_admin_real())
    )
  );

CREATE POLICY "professional_schedules_insert" ON professional_schedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id) OR is_super_admin_real())
    )
  );

CREATE POLICY "professional_schedules_update" ON professional_schedules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id) OR is_super_admin_real())
    )
  );

CREATE POLICY "professional_schedules_delete" ON professional_schedules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM professionals p
      WHERE p.id = professional_schedules.professional_id
        AND (p.user_id = auth.uid() OR current_user_is_admin(p.company_id) OR is_super_admin_real())
    )
  );

-- ============================================================
-- 4. PROFESSIONAL_DOCUMENTS
-- ============================================================

DROP POLICY IF EXISTS "View own documents" ON professional_documents;
DROP POLICY IF EXISTS "Edit own documents" ON professional_documents;

CREATE POLICY "View own documents" ON professional_documents
  FOR SELECT USING (
    professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM company_members cm
      JOIN app_roles ar ON cm.role_id = ar.id
      WHERE cm.user_id = auth.uid()
        AND ar.name IN ('supervisor', 'owner', 'admin', 'super_admin')
    )
    OR is_super_admin_real()
  );

CREATE POLICY "Edit own documents" ON professional_documents
  FOR ALL USING (
    professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM company_members cm
      JOIN app_roles ar ON cm.role_id = ar.id
      WHERE cm.user_id = auth.uid()
        AND ar.name IN ('supervisor', 'owner', 'admin', 'super_admin')
    )
    OR is_super_admin_real()
  )
  WITH CHECK (
    professional_id IN (SELECT id FROM professionals WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM company_members cm
      JOIN app_roles ar ON cm.role_id = ar.id
      WHERE cm.user_id = auth.uid()
        AND ar.name IN ('supervisor', 'owner', 'admin', 'super_admin')
    )
    OR is_super_admin_real()
  );
