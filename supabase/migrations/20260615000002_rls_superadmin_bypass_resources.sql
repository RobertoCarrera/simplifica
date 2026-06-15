-- Migration: rls-superadmin-bypass-for-resources
-- Grants superadmins visibility/control over the resources module
-- (resources, resource_services) regardless of their own company_id.
--
-- Background:
-- The "Reservas > Configuración > Profesionales > Sala por Defecto" dropdown
-- was empty for a superadmin inspecting a customer company. The
-- `resources_select` policy filtered by
--   `company_id = get_auth_user_company_id()`
-- which returns the superadmin's own company (not the customer being viewed).
-- Same root cause as the previous professionals-module fix (20260615000001).
--
-- This migration adds the same `OR is_super_admin_real()` bypass used in
-- the users_select policy and the 20260615000001 professionals fix.
--
-- Scope: SELECT on resources + resource_services. INSERT/UPDATE/DELETE
-- remain admin-gated by `current_user_is_admin(company_id)`, which the
-- superadmin satisfies for the target company via the global role check
-- inside that helper (`app_roles.name IN ('owner','admin','supervisor',
-- 'super_admin')`). The previous professionals fix took the same approach
-- of granting superadmins the same effective write access as
-- `current_user_is_admin(company_id)`, so we mirror it here for
-- consistency.
--
-- Verified empirically with `SET ROLE authenticated` and Roberto's JWT
-- (superadmin, company_id = Simplifica, viewing CAIBS data):
--   Before: resources=0, resource_services=0
--   After:  resources=1+, resource_services=8

-- ============================================================
-- 1. RESOURCES
-- ============================================================

DROP POLICY IF EXISTS "resources_select" ON resources;

CREATE POLICY "resources_select" ON resources
  FOR SELECT USING (
    company_id = get_auth_user_company_id()
    OR is_super_admin_real()
  );

DROP POLICY IF EXISTS "resources_insert" ON resources;
DROP POLICY IF EXISTS "resources_update" ON resources;
DROP POLICY IF EXISTS "resources_delete" ON resources;

CREATE POLICY "resources_insert" ON resources
  FOR INSERT WITH CHECK (
    current_user_is_admin(company_id)
    OR is_super_admin_real()
  );

CREATE POLICY "resources_update" ON resources
  FOR UPDATE USING (
    current_user_is_admin(company_id)
    OR is_super_admin_real()
  );

CREATE POLICY "resources_delete" ON resources
  FOR DELETE USING (
    current_user_is_admin(company_id)
    OR is_super_admin_real()
  );

-- ============================================================
-- 2. RESOURCE_SERVICES (junction table)
-- ============================================================

DROP POLICY IF EXISTS "Users can view resource services of their company" ON resource_services;
DROP POLICY IF EXISTS "Users can insert resource services of their company" ON resource_services;
DROP POLICY IF EXISTS "Users can update resource services of their company" ON resource_services;
DROP POLICY IF EXISTS "Users can delete resource services of their company" ON resource_services;

CREATE POLICY "Users can view resource services of their company" ON resource_services
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM resources r
      WHERE r.id = resource_services.resource_id
        AND (r.company_id = get_auth_user_company_id() OR is_super_admin_real())
    )
  );

CREATE POLICY "Users can insert resource services of their company" ON resource_services
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM resources r
      WHERE r.id = resource_services.resource_id
        AND (r.company_id = get_auth_user_company_id() OR is_super_admin_real())
    )
  );

CREATE POLICY "Users can update resource services of their company" ON resource_services
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM resources r
      WHERE r.id = resource_services.resource_id
        AND (r.company_id = get_auth_user_company_id() OR is_super_admin_real())
    )
  );

CREATE POLICY "Users can delete resource services of their company" ON resource_services
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM resources r
      WHERE r.id = resource_services.resource_id
        AND (r.company_id = get_auth_user_company_id() OR is_super_admin_real())
    )
  );
